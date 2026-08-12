import type { ExpenseWithDetails } from '../../domain/expenses/expense.entity';
import { ExpenseNotFoundError } from '../../domain/expenses/expense.errors';
import type { ExpenseRepository } from '../../domain/expenses/expense.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetExpenseInput {
  readonly expenseId: string;
}

export class GetExpenseUseCase implements UseCase<GetExpenseInput, ExpenseWithDetails> {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(input: GetExpenseInput): Promise<Result<ExpenseWithDetails, DomainError>> {
    const expense = await this.expenses.findByIdWithDetails(input.expenseId);
    if (expense === null) {
      return err(new ExpenseNotFoundError(input.expenseId));
    }
    return ok(expense);
  }
}
