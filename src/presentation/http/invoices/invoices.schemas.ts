import { z } from 'zod';
import { NCF_TYPES } from '../../../domain/invoices/invoice.entity';
import { dateOnly, paginationQuery, positiveMoney, requiredString, uuid } from '../shared/common.schemas';

const ncfType = z.enum(NCF_TYPES as unknown as [string, ...string[]]) as z.ZodType<
  (typeof NCF_TYPES)[number]
>;

const fiscalStatus = z.enum(['pending', 'issued', 'rejected', 'cancelled']);

/**
 * NCF electronico: `E` + tipo (2 digitos) + secuencia (10 digitos). La columna
 * admite 19 caracteres para tolerar comprobantes del regimen anterior.
 */
const ncfNumber = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'El NCF es obligatorio')
  .max(19, 'El NCF no puede superar los 19 caracteres');

export const createInvoiceSchema = z.object({
  saleId: uuid,
  // E34 queda fuera: es el tipo de las notas de credito, no de una factura.
  ncfType: z.enum(['E31', 'E32', 'E44', 'E45']),
});

export const issueInvoiceSchema = z.object({
  ncfNumber,
  dgiiTrackId: z.string().trim().max(100).nullable().optional().default(null),
  xmlUrl: z.string().trim().max(500).nullable().optional().default(null),
});

export const rejectInvoiceSchema = z.object({
  reason: requiredString(2000, 'El motivo del rechazo'),
});

export const listInvoicesQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  status: fiscalStatus.optional(),
  ncfType: ncfType.optional(),
  clientId: uuid.optional(),
  saleId: uuid.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export const createCreditNoteSchema = z.object({
  reason: requiredString(2000, 'El motivo de la nota de credito'),
  amount: positiveMoney,
});

export const issueCreditNoteSchema = issueInvoiceSchema;

export const creditNoteParamsSchema = z.object({ id: uuid, creditNoteId: uuid });

export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>;
export type IssueInvoiceBody = z.infer<typeof issueInvoiceSchema>;
export type RejectInvoiceBody = z.infer<typeof rejectInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type CreateCreditNoteBody = z.infer<typeof createCreditNoteSchema>;
export type IssueCreditNoteBody = z.infer<typeof issueCreditNoteSchema>;
