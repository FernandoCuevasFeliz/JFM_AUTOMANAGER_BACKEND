import { z } from 'zod';
import {
  dateOnly,
  exchangeRate,
  money,
  nullableString,
  paginationQuery,
  uuid,
} from '../shared/common.schemas';

const purchaseStatus = z.enum(['pending', 'in_transit', 'received', 'cancelled']);

const purchaseItemSchema = z.object({
  vehicleId: uuid,
  unitCost: money,
  freightCost: money.default(0),
  insuranceCost: money.default(0),
  otherCosts: money.default(0),
});

export const createPurchaseSchema = z.object({
  supplierId: uuid,
  currencyId: uuid,
  /** Opcional: si no se envia, el sistema genera `COM-ANO-NNNNNN`. */
  purchaseNumber: z.string().trim().max(30).optional(),
  invoiceNumber: nullableString(50),
  purchaseDate: dateOnly,
  exchangeRate: exchangeRate.default(1),
  status: purchaseStatus.default('pending'),
  notes: nullableString(5000),
  items: z.array(purchaseItemSchema).min(1, 'La compra debe incluir al menos un vehiculo'),
});

export const updatePurchaseSchema = z
  .object({
    supplierId: uuid.optional(),
    currencyId: uuid.optional(),
    invoiceNumber: nullableString(50),
    purchaseDate: dateOnly.optional(),
    exchangeRate: exchangeRate.optional(),
    notes: nullableString(5000),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const changePurchaseStatusSchema = z.object({ status: purchaseStatus });

export const listPurchasesQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  supplierId: uuid.optional(),
  status: purchaseStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type CreatePurchaseBody = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseBody = z.infer<typeof updatePurchaseSchema>;
export type ChangePurchaseStatusBody = z.infer<typeof changePurchaseStatusSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
