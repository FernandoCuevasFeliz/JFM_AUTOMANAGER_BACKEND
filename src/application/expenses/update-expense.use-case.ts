import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import {
  CurrencyNotFoundError,
  InconsistentExchangeRateError,
  PaymentMethodNotFoundError,
} from '../../domain/catalogs/catalog.errors';
import { type Expense, isExpenseScopeConsistent } from '../../domain/expenses/expense.entity';
import {
  ExpenseCategoryNotFoundError,
  ExpenseNotFoundError,
  ExpenseScopeMismatchError,
} from '../../domain/expenses/expense.errors';
import type { ExpenseRepository } from '../../domain/expenses/expense.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent } from '../../domain/shared/money';
import { err, ok, type Result } from '../../domain/shared/result';
import { VehicleNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdateExpenseInput {
  readonly expenseId: string;
  readonly categoryId?: string;
  readonly vehicleId?: string | null;
  readonly currencyId?: string;
  readonly paymentMethodId?: string;
  readonly description?: string;
  readonly amount?: number;
  readonly exchangeRate?: number;
  readonly expenseDate?: string;
}

export class UpdateExpenseUseCase implements UseCase<UpdateExpenseInput, Expense> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly catalog: CatalogRepository,
    private readonly vehicles: VehicleRepository,
  ) {}

  async execute(input: UpdateExpenseInput): Promise<Result<Expense, DomainError>> {
    const existing = await this.expenses.findById(input.expenseId);
    if (existing === null) {
      return err(new ExpenseNotFoundError(input.expenseId));
    }

    const categoryId = input.categoryId ?? existing.categoryId;
    const vehicleId = input.vehicleId !== undefined ? input.vehicleId : existing.vehicleId;

    const category = await this.catalog.findExpenseCategoryById(categoryId);
    if (category === null) {
      return err(new ExpenseCategoryNotFoundError(categoryId));
    }

    if (!isExpenseScopeConsistent(category.scope, vehicleId)) {
      return err(new ExpenseScopeMismatchError(category.scope));
    }

    if (
      input.vehicleId !== undefined &&
      input.vehicleId !== null &&
      (await this.vehicles.findById(input.vehicleId)) === null
    ) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    // La coherencia moneda/tasa se comprueba sobre el estado RESULTANTE: puede
    // cambiar solo la moneda, solo la tasa, o ambas.
    if (input.currencyId !== undefined || input.exchangeRate !== undefined) {
      const currencyId = input.currencyId ?? existing.currencyId;
      const exchangeRate = input.exchangeRate ?? existing.exchangeRate;

      const currency = await this.catalog.findCurrencyById(currencyId);
      if (currency === null) {
        return err(new CurrencyNotFoundError(currencyId));
      }
      if (!isExchangeRateConsistent(currency.code, exchangeRate)) {
        return err(new InconsistentExchangeRateError(currency.code, exchangeRate));
      }
    }

    if (
      input.paymentMethodId !== undefined &&
      (await this.catalog.findPaymentMethodById(input.paymentMethodId)) === null
    ) {
      return err(new PaymentMethodNotFoundError(input.paymentMethodId));
    }

    const updated = await this.expenses.update(input.expenseId, {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
      ...(input.currencyId !== undefined ? { currencyId: input.currencyId } : {}),
      ...(input.paymentMethodId !== undefined ? { paymentMethodId: input.paymentMethodId } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.exchangeRate !== undefined ? { exchangeRate: input.exchangeRate } : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
    });

    if (updated === null) {
      return err(new ExpenseNotFoundError(input.expenseId));
    }

    return ok(updated);
  }
}
