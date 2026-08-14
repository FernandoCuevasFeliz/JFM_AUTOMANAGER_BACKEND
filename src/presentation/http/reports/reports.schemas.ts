import { z } from 'zod';
import { FISCAL_DOC_STATUSES, NCF_TYPES } from '../../../domain/invoices/invoice.entity';
import { FISCAL_DOCUMENT_KINDS } from '../../../domain/reports/report.entity';
import { VEHICLE_STATUSES } from '../../../domain/vehicles/vehicle.entity';
import { booleanQuery, dateOnly, paginationQuery, uuid } from '../shared/common.schemas';

const vehicleStatus = z.enum(
  VEHICLE_STATUSES as unknown as [string, ...string[]],
) as z.ZodType<(typeof VEHICLE_STATUSES)[number]>;

const ncfType = z.enum(NCF_TYPES as unknown as [string, ...string[]]) as z.ZodType<
  (typeof NCF_TYPES)[number]
>;

const fiscalStatus = z.enum(
  FISCAL_DOC_STATUSES as unknown as [string, ...string[]],
) as z.ZodType<(typeof FISCAL_DOC_STATUSES)[number]>;

const documentKind = z.enum(
  FISCAL_DOCUMENT_KINDS as unknown as [string, ...string[]],
) as z.ZodType<(typeof FISCAL_DOCUMENT_KINDS)[number]>;

const expenseScope = z.enum(['general', 'vehicle']);

/**
 * Codigo ISO de moneda (`DOP`, `USD`). Se normaliza aqui para que el filtro no
 * dependa de como lo escriba el cliente.
 */
const currencyCode = z.string().trim().toUpperCase().length(3, 'El codigo de moneda tiene 3 letras');

/**
 * Rango de meses. Se admiten fechas completas (`YYYY-MM-DD`) por coherencia con
 * el resto de la API; el backend las lleva al mes al que pertenecen, asi que
 * cualquier dia de marzo significa "marzo".
 */
const monthRange = {
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  currency: currencyCode.optional(),
};

export const vehicleProfitabilityQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  status: vehicleStatus.optional(),
  vehicleId: uuid.optional(),
  /** `?sold=true` deja solo lo vendido; `false`, solo lo que sigue en stock. */
  sold: booleanQuery,
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export const accountsReceivableQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  clientId: uuid.optional(),
  salespersonId: uuid.optional(),
  /** Por defecto se listan solo las ventas con saldo; `false` incluye saldadas. */
  onlyPending: booleanQuery,
  minDaysOutstanding: z.coerce.number().int().nonnegative().optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export const monthlySalesQuerySchema = z.object(monthRange);

export const salesBySalespersonQuerySchema = z.object({
  ...monthRange,
  salespersonId: uuid.optional(),
});

export const monthlyExpensesQuerySchema = z.object({
  ...monthRange,
  categoryId: uuid.optional(),
  scope: expenseScope.optional(),
});

export const fiscalDocumentsQuerySchema = z.object({
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  currency: currencyCode.optional(),
  documentKind: documentKind.optional(),
  ncfType: ncfType.optional(),
  status: fiscalStatus.optional(),
});

export type VehicleProfitabilityQuery = z.infer<typeof vehicleProfitabilityQuerySchema>;
export type AccountsReceivableQuery = z.infer<typeof accountsReceivableQuerySchema>;
export type MonthlySalesQuery = z.infer<typeof monthlySalesQuerySchema>;
export type SalesBySalespersonQuery = z.infer<typeof salesBySalespersonQuerySchema>;
export type MonthlyExpensesQuery = z.infer<typeof monthlyExpensesQuerySchema>;
export type FiscalDocumentsQuery = z.infer<typeof fiscalDocumentsQuerySchema>;
