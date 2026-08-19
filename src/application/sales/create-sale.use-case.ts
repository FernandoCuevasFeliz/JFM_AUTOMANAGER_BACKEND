import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import {
  CurrencyNotFoundError,
  InconsistentExchangeRateError,
  PaymentMethodNotFoundError,
} from '../../domain/catalogs/catalog.errors';
import { ClientNotFoundError, InactiveClientError } from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import { isConvertible } from '../../domain/quotations/quotation.entity';
import {
  QuotationNotConvertibleError,
  QuotationNotFoundError,
} from '../../domain/quotations/quotation.errors';
import { isReservationConvertible } from '../../domain/reservations/reservation.entity';
import {
  ReservationClientMismatchError,
  ReservationNotConvertibleError,
  ReservationNotFoundError,
  ReservationVehicleMismatchError,
} from '../../domain/reservations/reservation.errors';
import type { SaleWithDetails } from '../../domain/sales/sale.entity';
import {
  DuplicateVehicleInSaleError,
  EmptySaleError,
  PaymentExceedsBalanceError,
  SaleNotFoundError,
  SalePriceBelowDepositError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent, toReportingCurrency } from '../../domain/shared/money';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import { isSellable } from '../../domain/vehicles/vehicle.entity';
import {
  VehicleAlreadySoldError,
  VehicleNotFoundError,
  VehicleNotSellableError,
} from '../../domain/vehicles/vehicle.errors';
import { documentYearPrefix, nextDocumentNumber, yearOf } from '../shared/document-number';
import type { ActorInput, UseCase } from '../shared/use-case';

/** Pago inicial opcional que se registra junto con la venta (inicial o deposito). */
export interface InitialPaymentInput {
  readonly paymentMethodId: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly referenceNumber: string | null;
}

/** Un vehiculo de la venta con el precio pactado para esa unidad. */
export interface SaleItemInput {
  readonly vehicleId: string;
  readonly salePrice: number;
}

export interface CreateSaleInput extends ActorInput {
  readonly reservationId: string | null;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly items: readonly SaleItemInput[];
  readonly currencyId: string;
  readonly exchangeRate: number;
  readonly saleDate: string;
  readonly salespersonId: string;
  readonly initialPayment: InitialPaymentInput | null;
}

/**
 * Cierre del ciclo comercial: la venta.
 *
 * Una venta puede llevar VARIOS vehiculos (flotilla, mayoreo): la cabecera dice
 * quien compra, cuando y en que moneda, y cada linea que unidad y a que precio.
 * El importe de la venta es la suma de las lineas, no una columna.
 *
 * Es la operacion mas delicada del sistema y ocurre integramente dentro de una
 * transaccion:
 *
 *  1. Se verifica CADA vehiculo: que sigue disponible (`in_inventory` o
 *     `reserved`) y que no esta ya en una linea vigente de otra venta (indice
 *     unico parcial `uq_sale_items_vehicle_active`; las canceladas no cuentan).
 *  2. Se crea la cabecera en estado `in_process` y sus lineas.
 *  3. Cada vehiculo pasa a `sold`.
 *  4. La reserva de origen, si existe, queda `converted`; lo mismo la
 *     cotizacion.
 *  5. Si se informo un pago inicial, se registra como primer `sale_payment`.
 *
 * Si cualquier paso falla se revierte todo: nunca queda un vehiculo marcado
 * como vendido sin venta, ni una venta sobre un vehiculo que en realidad sigue
 * en inventario, ni una venta a medio armar con tres de sus cinco unidades.
 *
 * Las validaciones de disponibilidad se repiten DENTRO de la transaccion (no
 * solo antes de abrirla) para que dos vendedores que registren la misma unidad
 * a la vez no puedan ambos pasar el control.
 */
export class CreateSaleUseCase implements UseCase<CreateSaleInput, SaleWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly sales: SaleRepository,
    private readonly clients: ClientRepository,
    private readonly catalog: CatalogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateSaleInput): Promise<Result<SaleWithDetails, DomainError>> {
    if (input.items.length === 0) {
      return err(new EmptySaleError());
    }

    const duplicated = firstDuplicateVehicle(input.items);
    if (duplicated !== null) {
      return err(new DuplicateVehicleInSaleError(duplicated));
    }

    const client = await this.clients.findById(input.clientId);
    if (client === null) {
      return err(new ClientNotFoundError(input.clientId));
    }
    if (!client.isActive) {
      return err(new InactiveClientError(input.clientId));
    }

    const currency = await this.catalog.findCurrencyById(input.currencyId);
    if (currency === null) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }
    if (!isExchangeRateConsistent(currency.code, input.exchangeRate)) {
      return err(new InconsistentExchangeRateError(currency.code, input.exchangeRate));
    }

    // El importe de la venta es la suma de sus lineas.
    const total = round2(input.items.reduce((sum, item) => sum + item.salePrice, 0));

    if (input.initialPayment !== null) {
      if (
        (await this.catalog.findPaymentMethodById(input.initialPayment.paymentMethodId)) === null
      ) {
        return err(new PaymentMethodNotFoundError(input.initialPayment.paymentMethodId));
      }
      if (input.initialPayment.amount > total) {
        return err(new PaymentExceedsBalanceError(input.initialPayment.amount, total));
      }
    }

    const today = this.clock.today();

    const result = await this.unitOfWork.run<string, DomainError>(async (trx) => {
      for (const item of input.items) {
        const vehicle = await trx.vehicles.findById(item.vehicleId);
        if (vehicle === null) {
          return err(new VehicleNotFoundError(item.vehicleId));
        }
        if (!isSellable(vehicle)) {
          return err(new VehicleNotSellableError(item.vehicleId, vehicle.status));
        }
        if (await trx.sales.isVehicleSold(item.vehicleId)) {
          return err(new VehicleAlreadySoldError(item.vehicleId));
        }
      }

      const vehicleIds = new Set(input.items.map((item) => item.vehicleId));

      if (input.reservationId !== null) {
        const reservation = await trx.reservations.findById(input.reservationId);
        if (reservation === null) {
          return err(new ReservationNotFoundError(input.reservationId));
        }
        if (reservation.clientId !== input.clientId) {
          return err(new ReservationClientMismatchError());
        }
        // La reserva es de un vehiculo; basta con que ese vehiculo este en la
        // venta. Lo normal es que la venta agregue mas unidades alrededor de la
        // reservada, y eso es legitimo.
        if (!vehicleIds.has(reservation.vehicleId)) {
          return err(new ReservationVehicleMismatchError());
        }
        if (!isReservationConvertible(reservation, today)) {
          return err(new ReservationNotConvertibleError(input.reservationId, reservation.status));
        }
        /*
         * Los dos importes, en la misma moneda antes de compararlos.
         *
         * `deposit_amount` se guarda sin moneda —esta en la de reporte por
         * convencion— mientras que el total viene en la divisa de la venta.
         * Comparandolos en crudo, una venta de 30.000 dolares contra un
         * deposito de 150.000 pesos se rechazaba estando bien; y al reves, una
         * venta en una divisa debil pasaba un control que deberia frenarla.
         */
        const totalConverted = toReportingCurrency(total, input.exchangeRate);
        if (totalConverted < reservation.depositAmount) {
          return err(new SalePriceBelowDepositError(totalConverted, reservation.depositAmount));
        }
      }

      if (input.quotationId !== null) {
        const quotation = await trx.quotations.findById(input.quotationId);
        if (quotation === null) {
          return err(new QuotationNotFoundError(input.quotationId));
        }
        if (quotation.clientId !== input.clientId) {
          return err(new ReservationClientMismatchError());
        }
        if (!vehicleIds.has(quotation.vehicleId)) {
          return err(new ReservationVehicleMismatchError());
        }
        // Una cotizacion ya convertida en la reserva que origina esta venta es
        // valida: no se exige que siga abierta si viene por esa via.
        if (quotation.status !== 'converted' && !isConvertible(quotation, today)) {
          return err(new QuotationNotConvertibleError(input.quotationId, quotation.status));
        }
      }

      const year = yearOf(input.saleDate);
      const lastNumber = await trx.sales.lastNumberForYear(documentYearPrefix('sale', year));

      const sale = await trx.sales.create({
        saleNumber: nextDocumentNumber('sale', year, lastNumber),
        reservationId: input.reservationId,
        quotationId: input.quotationId,
        clientId: input.clientId,
        currencyId: input.currencyId,
        exchangeRate: input.exchangeRate,
        saleDate: input.saleDate,
        status: 'in_process',
        salespersonId: input.salespersonId,
      });

      for (const item of input.items) {
        await trx.sales.addItem(sale.id, {
          vehicleId: item.vehicleId,
          salePrice: item.salePrice,
        });
        await trx.vehicles.updateStatus(item.vehicleId, 'sold');
      }

      if (input.reservationId !== null) {
        await trx.reservations.updateStatus(input.reservationId, 'converted');
      }

      if (input.quotationId !== null) {
        const quotation = await trx.quotations.findById(input.quotationId);
        if (quotation !== null && quotation.status !== 'converted') {
          await trx.quotations.updateStatus(input.quotationId, 'converted');
        }
      }

      if (input.initialPayment !== null) {
        await trx.sales.addPayment({
          saleId: sale.id,
          paymentMethodId: input.initialPayment.paymentMethodId,
          currencyId: input.currencyId,
          amount: input.initialPayment.amount,
          paymentDate: input.initialPayment.paymentDate,
          referenceNumber: input.initialPayment.referenceNumber,
          receivedBy: input.actorUserId,
        });
      }

      return ok(sale.id);
    });

    if (!result.ok) {
      return result;
    }

    const created = await this.sales.findByIdWithDetails(result.value);
    if (created === null) {
      return err(new SaleNotFoundError(result.value));
    }

    return ok(created);
  }
}

function firstDuplicateVehicle(items: readonly SaleItemInput[]): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.vehicleId)) {
      return item.vehicleId;
    }
    seen.add(item.vehicleId);
  }
  return null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
