import type { InvoiceWithDetails } from '../../domain/invoices/invoice.entity';
import type { InvoiceFilters, InvoiceRepository } from '../../domain/invoices/invoice.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListInvoicesInput {
  readonly filters: InvoiceFilters;
  readonly page: PageQuery;
}

export class ListInvoicesUseCase
  implements UseCase<ListInvoicesInput, PaginatedResult<InvoiceWithDetails>>
{
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(
    input: ListInvoicesInput,
  ): Promise<Result<PaginatedResult<InvoiceWithDetails>, DomainError>> {
    return ok(await this.invoices.list(input.filters, input.page));
  }
}
