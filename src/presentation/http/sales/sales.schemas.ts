import { z } from 'zod';
import {
  dateOnly,
  exchangeRate,
  money,
  nullableString,
  paginationQuery,
  positiveMoney,
  uuid,
} from '../shared/common.schemas';

const saleStatus = z.enum(['in_process', 'completed', 'cancelled']);

/**
 * Pago inicial opcional. Sirve para registrar de una vez el deposito que el
 * cliente dejo en la reserva: `reservations` guarda el monto pero no el metodo
 * de pago, asi que el metodo se informa aqui.
 */
const initialPaymentSchema = z.object({
  paymentMethodId: uuid,
  amount: positiveMoney,
  paymentDate: dateOnly,
  referenceNumber: nullableString(50),
});

export const createSaleSchema = z.object({
  reservationId: uuid.nullable().optional().default(null),
  quotationId: uuid.nullable().optional().default(null),
  clientId: uuid,
  vehicleId: uuid,
  currencyId: uuid,
  salePrice: money,
  exchangeRate: exchangeRate.default(1),
  saleDate: dateOnly,
  salespersonId: uuid,
  initialPayment: initialPaymentSchema.nullable().optional().default(null),
});

export const updateSaleSchema = z
  .object({
    salePrice: money.optional(),
    exchangeRate: exchangeRate.optional(),
    saleDate: dateOnly.optional(),
    salespersonId: uuid.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const registerPaymentSchema = z.object({
  paymentMethodId: uuid,
  currencyId: uuid,
  amount: positiveMoney,
  paymentDate: dateOnly,
  referenceNumber: nullableString(50),
});

export const listSalesQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  clientId: uuid.optional(),
  vehicleId: uuid.optional(),
  salespersonId: uuid.optional(),
  status: saleStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export const salesSummaryQuerySchema = z.object({
  clientId: uuid.optional(),
  salespersonId: uuid.optional(),
  status: saleStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type CreateSaleBody = z.infer<typeof createSaleSchema>;
export type UpdateSaleBody = z.infer<typeof updateSaleSchema>;
export type RegisterPaymentBody = z.infer<typeof registerPaymentSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
