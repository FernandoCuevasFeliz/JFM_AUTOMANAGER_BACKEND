import type { PurchaseWithDetails } from '../../domain/purchases/purchase.entity';
import { PurchaseNotFoundError } from '../../domain/purchases/purchase.errors';
import type { PurchaseRepository } from '../../domain/purchases/purchase.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetPurchaseInput {
  readonly purchaseId: string;
}

export class GetPurchaseUseCase implements UseCase<GetPurchaseInput, PurchaseWithDetails> {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(input: GetPurchaseInput): Promise<Result<PurchaseWithDetails, DomainError>> {
    const purchase = await this.purchases.findByIdWithDetails(input.purchaseId);
    if (purchase === null) {
      return err(new PurchaseNotFoundError(input.purchaseId));
    }
    return ok(purchase);
  }
}
