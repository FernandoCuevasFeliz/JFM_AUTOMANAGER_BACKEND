import type { ExpenseScope } from '../expenses/expense.entity';

export interface DocumentType {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Currency {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentMethod {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExpenseCategory {
  readonly id: string;
  readonly name: string;
  readonly scope: ExpenseScope;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Catalogos maestros de solo lectura para el resto del sistema. La escritura
 * esta limitada a categorias de gasto (las unicas que la operacion necesita
 * ampliar); monedas, tipos de documento y metodos de pago se administran por
 * migracion porque el codigo depende de sus valores.
 */
export interface CatalogRepository {
  listDocumentTypes(onlyActive: boolean): Promise<DocumentType[]>;
  findDocumentTypeById(id: string): Promise<DocumentType | null>;

  listCurrencies(onlyActive: boolean): Promise<Currency[]>;
  findCurrencyById(id: string): Promise<Currency | null>;

  listPaymentMethods(onlyActive: boolean): Promise<PaymentMethod[]>;
  findPaymentMethodById(id: string): Promise<PaymentMethod | null>;

  listExpenseCategories(onlyActive: boolean): Promise<ExpenseCategory[]>;
  findExpenseCategoryById(id: string): Promise<ExpenseCategory | null>;
  findExpenseCategoryByName(name: string): Promise<ExpenseCategory | null>;
  createExpenseCategory(name: string, scope: ExpenseScope): Promise<ExpenseCategory>;
  updateExpenseCategory(
    id: string,
    data: { name?: string; scope?: ExpenseScope; isActive?: boolean },
  ): Promise<ExpenseCategory | null>;
}
