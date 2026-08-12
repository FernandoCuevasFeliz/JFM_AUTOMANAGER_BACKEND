import { z } from 'zod';
import {
  booleanQuery,
  dateOnly,
  exchangeRate,
  paginationQuery,
  positiveMoney,
  requiredString,
  uuid,
} from '../shared/common.schemas';

/**
 * `vehicleId` en null significa gasto general de la empresa. Que la categoria
 * admita o exija vehiculo lo decide el dominio comparando con
 * `expense_categories.scope`.
 */
export const createExpenseSchema = z.object({
  categoryId: uuid,
  vehicleId: uuid.nullable().optional().default(null),
  currencyId: uuid,
  paymentMethodId: uuid,
  description: requiredString(255, 'La descripcion'),
  amount: positiveMoney,
  exchangeRate: exchangeRate.default(1),
  expenseDate: dateOnly,
});

export const updateExpenseSchema = z
  .object({
    categoryId: uuid.optional(),
    vehicleId: uuid.nullable().optional(),
    currencyId: uuid.optional(),
    paymentMethodId: uuid.optional(),
    description: requiredString(255, 'La descripcion').optional(),
    amount: positiveMoney.optional(),
    exchangeRate: exchangeRate.optional(),
    expenseDate: dateOnly.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const listExpensesQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  categoryId: uuid.optional(),
  vehicleId: uuid.optional(),
  generalOnly: booleanQuery,
  paymentMethodId: uuid.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type CreateExpenseBody = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseBody = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
