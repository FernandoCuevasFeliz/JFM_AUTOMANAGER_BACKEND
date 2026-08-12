import { ExpenseNotFoundError } from '../../domain/expenses/expense.errors';
import type { ExpenseRepository } from '../../domain/expenses/expense.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeleteExpenseInput {
  readonly expenseId: string;
}

export class DeleteExpenseUseCase implements UseCase<DeleteExpenseInput, void> {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(input: DeleteExpenseInput): Promise<Result<void, DomainError>> {
    const expense = await this.expenses.findById(input.expenseId);
    if (expense === null) {
      return err(new ExpenseNotFoundError(input.expenseId));
    }

    const deleted = await this.expenses.softDelete(input.expenseId);
    if (!deleted) {
      return err(new ExpenseNotFoundError(input.expenseId));
    }

    return okVoid();
  }
}
