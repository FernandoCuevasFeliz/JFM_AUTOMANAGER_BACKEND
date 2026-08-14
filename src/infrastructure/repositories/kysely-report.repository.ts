import { sql } from 'kysely';
import type {
  AccountReceivable,
  FiscalDocumentsReportRow,
  InventoryStatusRow,
  MonthlyExpensesReportRow,
  MonthlySalesReportRow,
  SalespersonReportRow,
  VehicleProfitability,
} from '../../domain/reports/report.entity';
import type {
  AccountsReceivableFilters,
  FiscalDocumentsFilters,
  MonthlyExpensesFilters,
  MonthlyRangeFilters,
  ReportRepository,
  SalespersonReportFilters,
  VehicleProfitabilityFilters,
} from '../../domain/reports/report.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import { likePattern, toNullableNumber, toNumber } from './mappers';

/**
 * Lleva una fecha civil al primer dia de su mes.
 *
 * Las vistas mensuales agregan por `date_trunc('month', ...)`, asi que un
 * filtro `dateFrom = 2026-03-15` compararia contra `2026-03-01` y dejaria marzo
 * fuera. Truncando el extremo del rango igual que la vista, pedir desde
 * cualquier dia de marzo incluye marzo entero, que es lo que espera quien pide
 * un reporte mensual.
 */
function monthStart(date: string) {
  return sql<string>`date_trunc('month', ${date}::date)::date`;
}

/** Los codigos de moneda viajan normalizados en mayusculas. */
function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Lectura de los reportes sobre las vistas de la migracion 007.
 *
 * Toda la logica de negocio del reporte (que filas entran, como se convierte
 * cada moneda, como se calcula el margen) vive en la definicion de las vistas.
 * Este repositorio solo aplica filtros, ordena y traduce `snake_case` a
 * `camelCase`: si un calculo cambia, cambia la vista, no este archivo.
 */
export class KyselyReportRepository implements ReportRepository {
  constructor(private readonly db: Executor) {}

  async vehicleProfitability(
    filters: VehicleProfitabilityFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<VehicleProfitability>> {
    let base = this.db.selectFrom('vw_vehicle_profitability');

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('chassis_number', 'ilike', pattern),
          eb('brand_name', 'ilike', pattern),
          eb('model_name', 'ilike', pattern),
        ]),
      );
    }
    if (filters.status !== undefined) {
      base = base.where('status', '=', filters.status);
    }
    if (filters.vehicleId !== undefined) {
      base = base.where('vehicle_id', '=', filters.vehicleId);
    }
    if (filters.sold === true) {
      base = base.where('sale_id', 'is not', null);
    } else if (filters.sold === false) {
      base = base.where('sale_id', 'is', null);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('sale_date', '>=', filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      base = base.where('sale_date', '<=', filters.dateTo);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll()
      // Las unidades sin vender no tienen margen; van al final para que las
      // primeras paginas muestren lo que si tiene resultado medible.
      .orderBy(sql`margin desc nulls last`)
      .orderBy('chassis_number', 'asc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    const items = rows.map((row) => ({
      vehicleId: row.vehicle_id,
      chassisNumber: row.chassis_number,
      brandName: row.brand_name,
      modelName: row.model_name,
      year: row.year,
      status: row.status,
      isActive: row.is_active,
      listPrice: toNullableNumber(row.list_price),
      purchaseCurrencyCode: row.purchase_currency_code,
      purchaseExchangeRate: toNullableNumber(row.purchase_exchange_rate),
      importSubtotal: toNumber(row.import_subtotal),
      importSubtotalConverted: toNumber(row.import_subtotal_converted),
      expensesTotalConverted: toNumber(row.expenses_total_converted),
      totalCostConverted: toNumber(row.total_cost_converted),
      saleId: row.sale_id,
      saleNumber: row.sale_number,
      saleStatus: row.sale_status,
      saleDate: row.sale_date,
      saleCurrencyCode: row.sale_currency_code,
      soldPrice: toNullableNumber(row.sold_price),
      soldPriceConverted: toNullableNumber(row.sold_price_converted),
      margin: toNullableNumber(row.margin),
      marginPercentage: toNullableNumber(row.margin_percentage),
    }));

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async accountsReceivable(
    filters: AccountsReceivableFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<AccountReceivable>> {
    let base = this.db.selectFrom('vw_accounts_receivable');

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('sale_number', 'ilike', pattern),
          eb('client_name', 'ilike', pattern),
          eb('chassis_number', 'ilike', pattern),
        ]),
      );
    }
    if (filters.clientId !== undefined) {
      base = base.where('client_id', '=', filters.clientId);
    }
    if (filters.salespersonId !== undefined) {
      base = base.where('salesperson_id', '=', filters.salespersonId);
    }
    if (filters.onlyPending === true) {
      base = base.where('pending_balance', '>', 0);
    }
    if (filters.minDaysOutstanding !== undefined) {
      base = base.where('days_outstanding', '>=', filters.minDaysOutstanding);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('sale_date', '>=', filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      base = base.where('sale_date', '<=', filters.dateTo);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll()
      // La deuda mas antigua primero: es el orden en que se gestiona el cobro.
      .orderBy('sale_date', 'asc')
      .orderBy('sale_number', 'asc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    const items = rows.map((row) => ({
      saleId: row.sale_id,
      saleNumber: row.sale_number,
      saleDate: row.sale_date,
      saleStatus: row.sale_status,
      clientId: row.client_id,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      vehicleId: row.vehicle_id,
      chassisNumber: row.chassis_number,
      salespersonId: row.salesperson_id,
      salespersonName: row.salesperson_name,
      currencyCode: row.currency_code,
      exchangeRate: toNumber(row.exchange_rate),
      salePrice: toNumber(row.sale_price),
      totalPaid: toNumber(row.total_paid),
      pendingBalance: toNumber(row.pending_balance),
      pendingBalanceConverted: toNumber(row.pending_balance_converted),
      daysOutstanding: Number(row.days_outstanding),
    }));

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async monthlySales(filters: MonthlyRangeFilters): Promise<MonthlySalesReportRow[]> {
    let query = this.db.selectFrom('vw_sales_summary_monthly').selectAll();

    if (filters.dateFrom !== undefined) {
      query = query.where('month', '>=', monthStart(filters.dateFrom));
    }
    if (filters.dateTo !== undefined) {
      query = query.where('month', '<=', monthStart(filters.dateTo));
    }
    if (filters.currencyCode !== undefined) {
      query = query.where('currency_code', '=', normalizeCurrency(filters.currencyCode));
    }

    const rows = await query.orderBy('month', 'desc').orderBy('currency_code', 'asc').execute();

    return rows.map((row) => ({
      month: row.month,
      currencyCode: row.currency_code,
      salesCount: Number(row.sales_count),
      totalAmount: toNumber(row.total_amount),
      totalAmountConverted: toNumber(row.total_amount_converted),
    }));
  }

  async salesBySalesperson(filters: SalespersonReportFilters): Promise<SalespersonReportRow[]> {
    let query = this.db.selectFrom('vw_sales_by_salesperson').selectAll();

    if (filters.dateFrom !== undefined) {
      query = query.where('month', '>=', monthStart(filters.dateFrom));
    }
    if (filters.dateTo !== undefined) {
      query = query.where('month', '<=', monthStart(filters.dateTo));
    }
    if (filters.currencyCode !== undefined) {
      query = query.where('currency_code', '=', normalizeCurrency(filters.currencyCode));
    }
    if (filters.salespersonId !== undefined) {
      query = query.where('salesperson_id', '=', filters.salespersonId);
    }

    // Ranking: dentro de cada mes, el que mas vendio primero.
    const rows = await query
      .orderBy('month', 'desc')
      .orderBy('total_amount_converted', 'desc')
      .orderBy('salesperson_name', 'asc')
      .execute();

    return rows.map((row) => ({
      month: row.month,
      salespersonId: row.salesperson_id,
      salespersonName: row.salesperson_name,
      currencyCode: row.currency_code,
      salesCount: Number(row.sales_count),
      totalAmount: toNumber(row.total_amount),
      totalAmountConverted: toNumber(row.total_amount_converted),
    }));
  }

  async monthlyExpenses(filters: MonthlyExpensesFilters): Promise<MonthlyExpensesReportRow[]> {
    let query = this.db.selectFrom('vw_expenses_summary_monthly').selectAll();

    if (filters.dateFrom !== undefined) {
      query = query.where('month', '>=', monthStart(filters.dateFrom));
    }
    if (filters.dateTo !== undefined) {
      query = query.where('month', '<=', monthStart(filters.dateTo));
    }
    if (filters.currencyCode !== undefined) {
      query = query.where('currency_code', '=', normalizeCurrency(filters.currencyCode));
    }
    if (filters.categoryId !== undefined) {
      query = query.where('category_id', '=', filters.categoryId);
    }
    if (filters.scope !== undefined) {
      query = query.where('scope', '=', filters.scope);
    }

    const rows = await query
      .orderBy('month', 'desc')
      .orderBy('total_amount_converted', 'desc')
      .orderBy('category_name', 'asc')
      .execute();

    return rows.map((row) => ({
      month: row.month,
      categoryId: row.category_id,
      categoryName: row.category_name,
      scope: row.scope,
      currencyCode: row.currency_code,
      expenseCount: Number(row.expense_count),
      totalAmount: toNumber(row.total_amount),
      totalAmountConverted: toNumber(row.total_amount_converted),
    }));
  }

  async fiscalDocuments(filters: FiscalDocumentsFilters): Promise<FiscalDocumentsReportRow[]> {
    let query = this.db.selectFrom('vw_fiscal_documents_summary').selectAll();

    if (filters.dateFrom !== undefined) {
      query = query.where('month', '>=', monthStart(filters.dateFrom));
    }
    if (filters.dateTo !== undefined) {
      query = query.where('month', '<=', monthStart(filters.dateTo));
    }
    if (filters.documentKind !== undefined) {
      query = query.where('document_kind', '=', filters.documentKind);
    }
    if (filters.ncfType !== undefined) {
      query = query.where('ncf_type', '=', filters.ncfType);
    }
    if (filters.status !== undefined) {
      query = query.where('status', '=', filters.status);
    }
    if (filters.currencyCode !== undefined) {
      query = query.where('currency_code', '=', normalizeCurrency(filters.currencyCode));
    }

    const rows = await query
      .orderBy('month', 'desc')
      .orderBy('document_kind', 'asc')
      .orderBy('ncf_type', 'asc')
      .orderBy('status', 'asc')
      .execute();

    return rows.map((row) => ({
      month: row.month,
      documentKind: row.document_kind,
      ncfType: row.ncf_type,
      status: row.status,
      currencyCode: row.currency_code,
      documentCount: Number(row.document_count),
      totalAmount: toNumber(row.total_amount),
      totalAmountConverted: toNumber(row.total_amount_converted),
    }));
  }

  async inventoryStatus(): Promise<InventoryStatusRow[]> {
    const rows = await this.db
      .selectFrom('vw_inventory_status_summary')
      .selectAll()
      .orderBy('status', 'asc')
      .execute();

    return rows.map((row) => ({
      status: row.status,
      vehicleCount: Number(row.vehicle_count),
    }));
  }
}
