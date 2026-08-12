import type { QuotationWithDetails } from '../../domain/quotations/quotation.entity';
import type {
  QuotationFilters,
  QuotationRepository,
} from '../../domain/quotations/quotation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListQuotationsInput {
  readonly filters: QuotationFilters;
  readonly page: PageQuery;
}

export class ListQuotationsUseCase
  implements UseCase<ListQuotationsInput, PaginatedResult<QuotationWithDetails>>
{
  constructor(private readonly quotations: QuotationRepository) {}

  async execute(
    input: ListQuotationsInput,
  ): Promise<Result<PaginatedResult<QuotationWithDetails>, DomainError>> {
    return ok(await this.quotations.list(input.filters, input.page));
  }
}
