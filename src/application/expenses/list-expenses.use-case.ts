import type { ExpenseWithDetails } from '../../domain/expenses/expense.entity';
import type { ExpenseFilters, ExpenseRepository } from '../../domain/expenses/expense.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListExpensesInput {
  readonly filters: ExpenseFilters;
  readonly page: PageQuery;
}

export class ListExpensesUseCase
  implements UseCase<ListExpensesInput, PaginatedResult<ExpenseWithDetails>>
{
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(
    input: ListExpensesInput,
  ): Promise<Result<PaginatedResult<ExpenseWithDetails>, DomainError>> {
    return ok(await this.expenses.list(input.filters, input.page));
  }
}
