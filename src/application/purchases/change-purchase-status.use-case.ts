import {
  canTransitionPurchaseTo,
  type PurchaseStatus,
  type PurchaseWithDetails,
} from '../../domain/purchases/purchase.entity';
import {
  InvalidPurchaseStatusTransitionError,
  PurchaseNotFoundError,
} from '../../domain/purchases/purchase.errors';
import type { PurchaseRepository } from '../../domain/purchases/purchase.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { UseCase } from '../shared/use-case';

export interface ChangePurchaseStatusInput {
  readonly purchaseId: string;
  readonly status: PurchaseStatus;
}

/**
 * Avance de estado de una compra.
 *
 * Marcarla como `received` es el evento que ingresa la mercancia: en la misma
 * transaccion, todos los vehiculos de la compra que sigan `in_transit` pasan a
 * `in_inventory` y quedan disponibles para vender. Los que ya esten en otro
 * estado (por ejemplo, entraron a taller apenas llegaron) se dejan como estan.
 */
export class ChangePurchaseStatusUseCase
  implements UseCase<ChangePurchaseStatusInput, PurchaseWithDetails>
{
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly purchases: PurchaseRepository,
  ) {}

  async execute(
    input: ChangePurchaseStatusInput,
  ): Promise<Result<PurchaseWithDetails, DomainError>> {
    const result = await this.unitOfWork.run<void, DomainError>(async (trx) => {
      const purchase = await trx.purchases.findById(input.purchaseId);
      if (purchase === null) {
        return err(new PurchaseNotFoundError(input.purchaseId));
      }

      if (!canTransitionPurchaseTo(purchase.status, input.status)) {
        return err(new InvalidPurchaseStatusTransitionError(purchase.status, input.status));
      }

      await trx.purchases.updateStatus(input.purchaseId, input.status);

      if (input.status === 'received') {
        const vehicleIds = await trx.purchases.listVehicleIds(input.purchaseId);
        for (const vehicleId of vehicleIds) {
          const vehicle = await trx.vehicles.findById(vehicleId);
          if (vehicle !== null && vehicle.status === 'in_transit') {
            await trx.vehicles.updateStatus(vehicleId, 'in_inventory');
          }
        }
      }

      return ok(undefined);
    });

    if (!result.ok) {
      return result;
    }

    const updated = await this.purchases.findByIdWithDetails(input.purchaseId);
    if (updated === null) {
      return err(new PurchaseNotFoundError(input.purchaseId));
    }

    return ok(updated);
  }
}
