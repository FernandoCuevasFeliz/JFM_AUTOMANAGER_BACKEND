import { PurchaseNotEditableError, PurchaseNotFoundError } from '../../domain/purchases/purchase.errors';
import type { PurchaseRepository } from '../../domain/purchases/purchase.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeletePurchaseInput {
  readonly purchaseId: string;
}

/**
 * Borrado logico de una compra. Una compra ya recibida no se borra: sus
 * vehiculos estan en inventario y su costo forma parte del margen de cada
 * unidad. Para deshacerla se usa el cambio de estado a `cancelled`.
 */
export class DeletePurchaseUseCase implements UseCase<DeletePurchaseInput, void> {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(input: DeletePurchaseInput): Promise<Result<void, DomainError>> {
    const purchase = await this.purchases.findById(input.purchaseId);
    if (purchase === null) {
      return err(new PurchaseNotFoundError(input.purchaseId));
    }

    if (purchase.status === 'received') {
      return err(new PurchaseNotEditableError(purchase.status));
    }

    const deleted = await this.purchases.softDelete(input.purchaseId);
    if (!deleted) {
      return err(new PurchaseNotFoundError(input.purchaseId));
    }

    return okVoid();
  }
}
