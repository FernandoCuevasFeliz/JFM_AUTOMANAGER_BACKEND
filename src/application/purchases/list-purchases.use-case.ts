import type { PurchaseWithDetails } from '../../domain/purchases/purchase.entity';
import type {
  PurchaseFilters,
  PurchaseRepository,
} from '../../domain/purchases/purchase.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListPurchasesInput {
  readonly filters: PurchaseFilters;
  readonly page: PageQuery;
}

export class ListPurchasesUseCase
  implements UseCase<ListPurchasesInput, PaginatedResult<PurchaseWithDetails>>
{
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(
    input: ListPurchasesInput,
  ): Promise<Result<PaginatedResult<PurchaseWithDetails>, DomainError>> {
    return ok(await this.purchases.list(input.filters, input.page));
  }
}
