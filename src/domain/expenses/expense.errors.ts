import { BusinessRuleError, NotFoundError } from '../shared/domain-error';
import type { ExpenseScope } from './expense.entity';

export class ExpenseNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Gasto', identifier);
  }
}

export class ExpenseCategoryNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Categoria de gasto', identifier);
  }
}

export class ExpenseScopeMismatchError extends BusinessRuleError {
  constructor(scope: ExpenseScope) {
    super(
      scope === 'vehicle'
        ? 'La categoria seleccionada corresponde a un gasto por vehiculo: debe indicar el vehiculo'
        : 'La categoria seleccionada corresponde a un gasto general de la empresa: no debe indicar un vehiculo',
      { scope },
    );
  }
}
