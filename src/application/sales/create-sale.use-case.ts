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
  PaymentExceedsBalanceError,
  SaleNotFoundError,
  SalePriceBelowDepositError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent } from '../../domain/shared/money';
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

export interface CreateSaleInput extends ActorInput {
  readonly reservationId: string | null;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly currencyId: string;
  readonly salePrice: number;
  readonly exchangeRate: number;
  readonly saleDate: string;
  readonly salespersonId: string;
  readonly initialPayment: InitialPaymentInput | null;
}

/**
 * Cierre del ciclo comercial: la venta.
 *
 * Es la operacion mas delicada del sistema y ocurre integramente dentro de una
 * transaccion:
 *
 *  1. Se verifica que el vehiculo sigue disponible (`in_inventory` o
 *     `reserved`) y que no tiene ya una venta vigente (indice unico parcial
 *     `uq_sales_vehicle_active`; las canceladas no cuentan).
 *  2. Se crea la venta en estado `in_process`.
 *  3. El vehiculo pasa a `sold`.
 *  4. La reserva de origen, si existe, queda `converted`; lo mismo la
 *     cotizacion.
 *  5. Si se informo un pago inicial, se registra como primer `sale_payment`.
 *
 * Si cualquier paso falla se revierte todo: nunca queda un vehiculo marcado
 * como vendido sin venta, ni una venta sobre un vehiculo que en realidad sigue
 * en inventario.
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

    if (input.initialPayment !== null) {
      if (
        (await this.catalog.findPaymentMethodById(input.initialPayment.paymentMethodId)) === null
      ) {
        return err(new PaymentMethodNotFoundError(input.initialPayment.paymentMethodId));
      }
      if (input.initialPayment.amount > input.salePrice) {
        return err(new PaymentExceedsBalanceError(input.initialPayment.amount, input.salePrice));
      }
    }

    const today = this.clock.today();

    const result = await this.unitOfWork.run<string, DomainError>(async (trx) => {
      const vehicle = await trx.vehicles.findById(input.vehicleId);
      if (vehicle === null) {
        return err(new VehicleNotFoundError(input.vehicleId));
      }
      if (!isSellable(vehicle)) {
        return err(new VehicleNotSellableError(input.vehicleId, vehicle.status));
      }
      if (await trx.sales.isVehicleSold(input.vehicleId)) {
        return err(new VehicleAlreadySoldError(input.vehicleId));
      }

      if (input.reservationId !== null) {
        const reservation = await trx.reservations.findById(input.reservationId);
        if (reservation === null) {
          return err(new ReservationNotFoundError(input.reservationId));
        }
        if (reservation.clientId !== input.clientId) {
          return err(new ReservationClientMismatchError());
        }
        if (reservation.vehicleId !== input.vehicleId) {
          return err(new ReservationVehicleMismatchError());
        }
        if (!isReservationConvertible(reservation, today)) {
          return err(new ReservationNotConvertibleError(input.reservationId, reservation.status));
        }
        if (input.salePrice < reservation.depositAmount) {
          return err(new SalePriceBelowDepositError(input.salePrice, reservation.depositAmount));
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
        if (quotation.vehicleId !== input.vehicleId) {
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
        vehicleId: input.vehicleId,
        currencyId: input.currencyId,
        salePrice: input.salePrice,
        exchangeRate: input.exchangeRate,
        saleDate: input.saleDate,
        status: 'in_process',
        salespersonId: input.salespersonId,
      });

      await trx.vehicles.updateStatus(input.vehicleId, 'sold');

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
