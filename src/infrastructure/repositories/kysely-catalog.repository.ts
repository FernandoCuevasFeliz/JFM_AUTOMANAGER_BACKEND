import type { Selectable } from 'kysely';
import type {
  CatalogRepository,
  Currency,
  DocumentType,
  ExpenseCategory,
  PaymentMethod,
} from '../../domain/catalogs/catalog.entity';
import type { ExpenseScope } from '../../domain/expenses/expense.entity';
import type { Executor } from '../database/connection';
import type {
  CurrenciesTable,
  DocumentTypesTable,
  ExpenseCategoriesTable,
  PaymentMethodsTable,
} from '../database/database.types';
import { isEmptyPatch, toDate } from './mappers';

function mapDocumentType(row: Selectable<DocumentTypesTable>): DocumentType {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapCurrency(row: Selectable<CurrenciesTable>): Currency {
  return {
    id: row.id,
    // CHAR(3) llega con relleno de espacios; el dominio espera 'DOP', no 'DOP '.
    code: row.code.trim(),
    name: row.name,
    symbol: row.symbol,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapPaymentMethod(row: Selectable<PaymentMethodsTable>): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapExpenseCategory(row: Selectable<ExpenseCategoriesTable>): ExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class KyselyCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Executor) {}

  async listDocumentTypes(onlyActive: boolean): Promise<DocumentType[]> {
    let query = this.db.selectFrom('document_types').selectAll().orderBy('name', 'asc');
    if (onlyActive) {
      query = query.where('is_active', '=', true);
    }
    return (await query.execute()).map(mapDocumentType);
  }

  async findDocumentTypeById(id: string): Promise<DocumentType | null> {
    const row = await this.db
      .selectFrom('document_types')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : mapDocumentType(row);
  }

  async listCurrencies(onlyActive: boolean): Promise<Currency[]> {
    let query = this.db.selectFrom('currencies').selectAll().orderBy('code', 'asc');
    if (onlyActive) {
      query = query.where('is_active', '=', true);
    }
    return (await query.execute()).map(mapCurrency);
  }

  async findCurrencyById(id: string): Promise<Currency | null> {
    const row = await this.db
      .selectFrom('currencies')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : mapCurrency(row);
  }

  async listPaymentMethods(onlyActive: boolean): Promise<PaymentMethod[]> {
    let query = this.db.selectFrom('payment_methods').selectAll().orderBy('name', 'asc');
    if (onlyActive) {
      query = query.where('is_active', '=', true);
    }
    return (await query.execute()).map(mapPaymentMethod);
  }

  async findPaymentMethodById(id: string): Promise<PaymentMethod | null> {
    const row = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : mapPaymentMethod(row);
  }

  async listExpenseCategories(onlyActive: boolean): Promise<ExpenseCategory[]> {
    let query = this.db
      .selectFrom('expense_categories')
      .selectAll()
      .orderBy('scope', 'asc')
      .orderBy('name', 'asc');
    if (onlyActive) {
      query = query.where('is_active', '=', true);
    }
    return (await query.execute()).map(mapExpenseCategory);
  }

  async findExpenseCategoryById(id: string): Promise<ExpenseCategory | null> {
    const row = await this.db
      .selectFrom('expense_categories')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : mapExpenseCategory(row);
  }

  async findExpenseCategoryByName(name: string): Promise<ExpenseCategory | null> {
    const row = await this.db
      .selectFrom('expense_categories')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();
    return row === undefined ? null : mapExpenseCategory(row);
  }

  async createExpenseCategory(name: string, scope: ExpenseScope): Promise<ExpenseCategory> {
    const row = await this.db
      .insertInto('expense_categories')
      .values({ name, scope })
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapExpenseCategory(row);
  }

  async updateExpenseCategory(
    id: string,
    data: { name?: string; scope?: ExpenseScope; isActive?: boolean },
  ): Promise<ExpenseCategory | null> {
    const patch = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.scope !== undefined ? { scope: data.scope } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findExpenseCategoryById(id);
    }

    const row = await this.db
      .updateTable('expense_categories')
      .set(patch)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapExpenseCategory(row);
  }
}
