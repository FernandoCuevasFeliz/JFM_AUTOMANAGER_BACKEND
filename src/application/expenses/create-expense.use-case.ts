import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import {
  CurrencyNotFoundError,
  InconsistentExchangeRateError,
  PaymentMethodNotFoundError,
} from '../../domain/catalogs/catalog.errors';
import { type Expense, isExpenseScopeConsistent } from '../../domain/expenses/expense.entity';
import {
  ExpenseCategoryNotFoundError,
  ExpenseScopeMismatchError,
} from '../../domain/expenses/expense.errors';
import type { ExpenseRepository } from '../../domain/expenses/expense.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent } from '../../domain/shared/money';
import { err, ok, type Result } from '../../domain/shared/result';
import { VehicleNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreateExpenseInput extends ActorInput {
  readonly categoryId: string;
  readonly vehicleId: string | null;
  readonly currencyId: string;
  readonly paymentMethodId: string;
  readonly description: string;
  readonly amount: number;
  /** Pesos por unidad de `currencyId`. 1 si el gasto ya esta en pesos. */
  readonly exchangeRate: number;
  readonly expenseDate: string;
}

/**
 * Registro de un gasto, general o imputado a un vehiculo.
 *
 * La regla central es la coherencia con el `scope` de la categoria: una
 * categoria de vehiculo exige vehiculo y una general lo prohibe. Sin ella, el
 * costo real por unidad (y por tanto el margen de la venta) quedaria mezclado
 * con gastos de la empresa.
 */
export class CreateExpenseUseCase implements UseCase<CreateExpenseInput, Expense> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly catalog: CatalogRepository,
    private readonly vehicles: VehicleRepository,
  ) {}

  async execute(input: CreateExpenseInput): Promise<Result<Expense, DomainError>> {
    const category = await this.catalog.findExpenseCategoryById(input.categoryId);
    if (category === null) {
      return err(new ExpenseCategoryNotFoundError(input.categoryId));
    }

    if (!isExpenseScopeConsistent(category.scope, input.vehicleId)) {
      return err(new ExpenseScopeMismatchError(category.scope));
    }

    if (input.vehicleId !== null && (await this.vehicles.findById(input.vehicleId)) === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    const currency = await this.catalog.findCurrencyById(input.currencyId);
    if (currency === null) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }
    if (!isExchangeRateConsistent(currency.code, input.exchangeRate)) {
      return err(new InconsistentExchangeRateError(currency.code, input.exchangeRate));
    }

    if ((await this.catalog.findPaymentMethodById(input.paymentMethodId)) === null) {
      return err(new PaymentMethodNotFoundError(input.paymentMethodId));
    }

    const expense = await this.expenses.create({
      categoryId: input.categoryId,
      vehicleId: input.vehicleId,
      currencyId: input.currencyId,
      paymentMethodId: input.paymentMethodId,
      description: input.description.trim(),
      amount: input.amount,
      exchangeRate: input.exchangeRate,
      expenseDate: input.expenseDate,
      createdBy: input.actorUserId,
    });

    return ok(expense);
  }
}
