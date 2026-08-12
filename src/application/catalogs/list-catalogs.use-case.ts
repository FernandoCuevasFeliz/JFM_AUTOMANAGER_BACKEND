import type {
  CatalogRepository,
  Currency,
  DocumentType,
  ExpenseCategory,
  PaymentMethod,
} from '../../domain/catalogs/catalog.entity';
import { ExpenseCategoryAlreadyExistsError } from '../../domain/catalogs/catalog.errors';
import type { ExpenseScope } from '../../domain/expenses/expense.entity';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListCatalogsInput {
  readonly onlyActive: boolean;
}

export interface CatalogsSnapshot {
  readonly documentTypes: DocumentType[];
  readonly currencies: Currency[];
  readonly paymentMethods: PaymentMethod[];
  readonly expenseCategories: ExpenseCategory[];
}

/**
 * Devuelve todos los catalogos de una vez. El frontend los necesita juntos
 * para armar los formularios de cliente, compra, gasto y venta; pedirlos en
 * cuatro peticiones separadas solo agrega latencia.
 */
export class ListCatalogsUseCase implements UseCase<ListCatalogsInput, CatalogsSnapshot> {
  constructor(private readonly catalog: CatalogRepository) {}

  async execute(input: ListCatalogsInput): Promise<Result<CatalogsSnapshot, DomainError>> {
    const [documentTypes, currencies, paymentMethods, expenseCategories] = await Promise.all([
      this.catalog.listDocumentTypes(input.onlyActive),
      this.catalog.listCurrencies(input.onlyActive),
      this.catalog.listPaymentMethods(input.onlyActive),
      this.catalog.listExpenseCategories(input.onlyActive),
    ]);

    return ok({ documentTypes, currencies, paymentMethods, expenseCategories });
  }
}

export interface CreateExpenseCategoryInput {
  readonly name: string;
  readonly scope: ExpenseScope;
}

export class CreateExpenseCategoryUseCase
  implements UseCase<CreateExpenseCategoryInput, ExpenseCategory>
{
  constructor(private readonly catalog: CatalogRepository) {}

  async execute(
    input: CreateExpenseCategoryInput,
  ): Promise<Result<ExpenseCategory, DomainError>> {
    const name = input.name.trim();
    if ((await this.catalog.findExpenseCategoryByName(name)) !== null) {
      return err(new ExpenseCategoryAlreadyExistsError(name));
    }
    return ok(await this.catalog.createExpenseCategory(name, input.scope));
  }
}
