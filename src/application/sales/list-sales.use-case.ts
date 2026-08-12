import type { SaleWithDetails } from '../../domain/sales/sale.entity';
import type { SaleFilters, SaleRepository, SalesSummary } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListSalesInput {
  readonly filters: SaleFilters;
  readonly page: PageQuery;
}

export class ListSalesUseCase
  implements UseCase<ListSalesInput, PaginatedResult<SaleWithDetails>>
{
  constructor(private readonly sales: SaleRepository) {}

  async execute(
    input: ListSalesInput,
  ): Promise<Result<PaginatedResult<SaleWithDetails>, DomainError>> {
    return ok(await this.sales.list(input.filters, input.page));
  }
}

export interface GetSalesSummaryInput {
  readonly filters: SaleFilters;
}

/** Totales de ventas del periodo: facturado, cobrado y por cobrar. */
export class GetSalesSummaryUseCase implements UseCase<GetSalesSummaryInput, SalesSummary> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(input: GetSalesSummaryInput): Promise<Result<SalesSummary, DomainError>> {
    return ok(await this.sales.summary(input.filters));
  }
}
