import { z } from 'zod';
import { dateOnly, money, nullableString, paginationQuery, uuid } from '../shared/common.schemas';

const quotationStatus = z.enum(['pending', 'approved', 'rejected', 'expired', 'converted']);

export const createQuotationSchema = z.object({
  clientId: uuid,
  vehicleId: uuid,
  currencyId: uuid,
  quotedPrice: money,
  validUntil: dateOnly,
  notes: nullableString(5000),
});

export const updateQuotationSchema = z
  .object({
    currencyId: uuid.optional(),
    quotedPrice: money.optional(),
    validUntil: dateOnly.optional(),
    notes: nullableString(5000),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

/**
 * `converted` no es asignable a mano: lo fija el sistema al crear la reserva o
 * la venta que nace de la cotizacion.
 */
export const changeQuotationStatusSchema = z.object({
  status: z.enum(['approved', 'rejected', 'expired']),
});

export const listQuotationsQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  clientId: uuid.optional(),
  vehicleId: uuid.optional(),
  status: quotationStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type CreateQuotationBody = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationBody = z.infer<typeof updateQuotationSchema>;
export type ChangeQuotationStatusBody = z.infer<typeof changeQuotationStatusSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;
