import { SaleHasActiveInvoiceError } from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import { canTransitionSaleTo, type SaleWithDetails } from '../../domain/sales/sale.entity';
import { InvalidSaleStatusTransitionError, SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { UseCase } from '../shared/use-case';

export interface CancelSaleInput {
  readonly saleId: string;
}

/** Motivo con el que quedan marcadas las lineas al caerse la venta entera. */
const CANCELLATION_REASON = 'Venta cancelada';

/**
 * Anulacion de una venta completa (desistimiento).
 *
 * En la misma transaccion la venta pasa a `cancelled`, TODAS sus lineas
 * vigentes quedan `returned` y cada vehiculo vuelve a `in_inventory`. Devolver
 * un solo vehiculo de una venta de varios no es esto: eso es
 * `return-sale-item`, y deja la venta viva con el resto de las unidades.
 *
 * Marcar las lineas es lo que libera los vehiculos ante el indice unico parcial
 * `uq_sale_items_vehicle_active` (migracion 008), que es quien impide dos
 * ventas vigentes de la misma unidad. El documento anulado permanece como
 * historial y no bloquea nada: el vehiculo queda disponible de inmediato para
 * venderse de nuevo, sin necesidad de borrarlo.
 *
 * BLOQUEO FISCAL: si la venta tiene un comprobante vivo (pendiente, rechazado o
 * emitido), no se puede cancelar. Un e-CF emitido no desaparece porque el
 * sistema marque la venta como anulada; ante la DGII la operacion sigue
 * existiendo hasta que una nota de credito cubra su importe. Primero se anula
 * el comprobante, despues la venta.
 */
export class CancelSaleUseCase implements UseCase<CancelSaleInput, SaleWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly sales: SaleRepository,
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CancelSaleInput): Promise<Result<SaleWithDetails, DomainError>> {
    const invoice = await this.invoices.findBySaleId(input.saleId);
    if (invoice !== null && invoice.status !== 'cancelled') {
      return err(new SaleHasActiveInvoiceError(input.saleId, invoice.ncfNumber));
    }

    const result = await this.unitOfWork.run<void, DomainError>(async (trx) => {
      const sale = await trx.sales.findById(input.saleId);
      if (sale === null) {
        return err(new SaleNotFoundError(input.saleId));
      }

      if (!canTransitionSaleTo(sale.status, 'cancelled')) {
        return err(new InvalidSaleStatusTransitionError(sale.status, 'cancelled'));
      }

      await trx.sales.updateStatus(input.saleId, 'cancelled');

      const returned = await trx.sales.returnAllItems(input.saleId, {
        returnedAt: this.clock.now(),
        reason: CANCELLATION_REASON,
      });

      for (const item of returned) {
        const vehicle = await trx.vehicles.findById(item.vehicleId);
        if (vehicle !== null && vehicle.status === 'sold') {
          await trx.vehicles.updateStatus(item.vehicleId, 'in_inventory');
        }
      }

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
