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
 * Importante: la venta cancelada permanece en la tabla y `sales.vehicle_id` es
 * UNIQUE, asi que el vehiculo NO podra venderse de nuevo mientras ese registro
 * exista. Para revenderlo hay que eliminar la venta cancelada
 * (`delete-sale.use-case.ts`). Ver la nota sobre este constraint en el README.
 */
export class CancelSaleUseCase implements UseCase<CancelSaleInput, SaleWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly sales: SaleRepository,
  ) {}

  async execute(input: CancelSaleInput): Promise<Result<SaleWithDetails, DomainError>> {
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
