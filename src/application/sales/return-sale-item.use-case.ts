import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import {
  acceptsReturns,
  isItemActive,
  type SaleWithDetails,
} from '../../domain/sales/sale.entity';
import {
  SaleDoesNotAcceptReturnsError,
  SaleItemAlreadyReturnedError,
  SaleItemDoesNotBelongToSaleError,
  SaleItemNotCreditedError,
  SaleItemNotFoundError,
  SaleNotFoundError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { VehicleStatus } from '../../domain/vehicles/vehicle.entity';

import type { UseCase } from '../shared/use-case';

/**
 * Estados a los que puede volver un vehiculo devuelto. `in_repair` cubre el caso
 * habitual: vuelve con un problema y no puede reofertarse tal cual.
 */
export type ReturnDestination = Extract<VehicleStatus, 'in_inventory' | 'in_repair'>;

export interface ReturnSaleItemInput {
  readonly saleId: string;
  readonly saleItemId: string;
  readonly reason: string;
  readonly destination: ReturnDestination;
}

/**
 * Devolucion de UN vehiculo de la venta.
 *
 * La linea pasa a `returned` —nunca se borra: la operacion ocurrio— y el
 * vehiculo vuelve al inventario. La venta y sus demas lineas no se tocan: el
 * total vigente baja solo porque la linea deja de sumar, sin reescribir ningun
 * importe historico. Ese es el motivo de que el precio viva en la linea y no en
 * la cabecera.
 *
 * BLOQUEO FISCAL: si la venta tiene una factura EMITIDA, el importe de esta
 * unidad ya existe ante la DGII. Sacarla del total sin acreditarla dejaria la
 * venta y el comprobante contando dinero distinto, asi que primero hay que
 * emitir una nota de credito por el importe de la linea
 * (`POST /invoices/:id/credit-notes` con `saleItemId`) y despues devolver. Una
 * factura `pending` o `rejected` todavia no existe para la DGII y no bloquea.
 *
 * El reembolso del dinero NO ocurre aqui: es un acto de caja aparte, con su
 * propia fecha, metodo y tasa (`POST /sales/:id/refunds`). Devolver el vehiculo
 * y devolver el dinero son dos hechos distintos y pueden no coincidir en el
 * tiempo ni en el importe.
 */
export class ReturnSaleItemUseCase implements UseCase<ReturnSaleItemInput, SaleWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly sales: SaleRepository,
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ReturnSaleItemInput): Promise<Result<SaleWithDetails, DomainError>> {
    const result = await this.unitOfWork.run<void, DomainError>(async (trx) => {
      const sale = await trx.sales.findById(input.saleId);
      if (sale === null) {
        return err(new SaleNotFoundError(input.saleId));
      }
      if (!acceptsReturns(sale)) {
        return err(new SaleDoesNotAcceptReturnsError(sale.status));
      }

      const item = sale.items.find((candidate) => candidate.id === input.saleItemId);
      if (item === undefined) {
        const exists = await trx.sales.findItemById(input.saleItemId);
        return err(
          exists === null
            ? new SaleItemNotFoundError(input.saleItemId)
            : new SaleItemDoesNotBelongToSaleError(input.saleItemId, input.saleId),
        );
      }
      if (!isItemActive(item)) {
        return err(new SaleItemAlreadyReturnedError(input.saleItemId));
      }

      const invoice = await this.invoices.findBySaleId(input.saleId);
      if (invoice !== null && invoice.status === 'issued') {
        const credited = await this.invoices.creditedAmountForSaleItem(input.saleItemId);
        if (credited + 0.01 < item.salePrice) {
          return err(new SaleItemNotCreditedError(input.saleItemId, item.salePrice, credited));
        }
      }

      await trx.sales.returnItem(input.saleItemId, {
        returnedAt: this.clock.now(),
        reason: input.reason.trim(),
      });

      await trx.vehicles.updateStatus(item.vehicleId, input.destination);

      return ok(undefined);
    });

    if (!result.ok) {
      return result;
    }

    const updated = await this.sales.findByIdWithDetails(input.saleId);
    if (updated === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return ok(updated);
  }
}
