import type { AccountReceivable } from '../../domain/reports/report.entity';
import type {
  AccountsReceivableFilters,
  ReportRepository,
} from '../../domain/reports/report.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetAccountsReceivableInput {
  readonly filters: AccountsReceivableFilters;
  readonly page: PageQuery;
}

/** Saldo pendiente por venta. Las ventas canceladas no entran (no hay que cobrar). */
export class GetAccountsReceivableUseCase
  implements UseCase<GetAccountsReceivableInput, PaginatedResult<AccountReceivable>>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: GetAccountsReceivableInput,
  ): Promise<Result<PaginatedResult<AccountReceivable>, DomainError>> {
    return ok(await this.reports.accountsReceivable(input.filters, input.page));
  }
}
