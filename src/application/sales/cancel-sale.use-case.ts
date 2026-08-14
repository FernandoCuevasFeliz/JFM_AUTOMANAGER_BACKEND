import { SaleHasActiveInvoiceError } from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import { canTransitionSaleTo, type SaleWithDetails } from '../../domain/sales/sale.entity';
import { InvalidSaleStatusTransitionError, SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { UseCase } from '../shared/use-case';

export interface CancelSaleInput {
  readonly saleId: string;
}

/**
 * Anulacion de una venta (desistimiento o devolucion).
 *
 * En la misma transaccion la venta pasa a `cancelled` y el vehiculo vuelve a
 * `in_inventory`: es la unica via por la que una unidad sale del estado `sold`.
 *
 * La venta cancelada permanece en la tabla como historial. Gracias al indice
 * unico parcial `uq_sales_vehicle_active` (migracion 003) eso no bloquea nada:
 * el vehiculo queda inmediatamente disponible para venderse de nuevo, sin
 * necesidad de borrar el documento anulado.
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

      const vehicle = await trx.vehicles.findById(sale.vehicleId);
      if (vehicle !== null && vehicle.status === 'sold') {
        await trx.vehicles.updateStatus(sale.vehicleId, 'in_inventory');
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
