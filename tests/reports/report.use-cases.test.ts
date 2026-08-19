import { describe, expect, it } from 'vitest';
import { GetAccountsReceivableUseCase } from '../../src/application/reports/get-accounts-receivable.use-case';
import { GetFiscalDocumentsReportUseCase } from '../../src/application/reports/get-fiscal-documents-report.use-case';
import { GetInventoryStatusReportUseCase } from '../../src/application/reports/get-inventory-status-report.use-case';
import { GetMonthlyExpensesReportUseCase } from '../../src/application/reports/get-monthly-expenses-report.use-case';
import {
  GetMonthlySalesReportUseCase,
  GetSalesBySalespersonReportUseCase,
} from '../../src/application/reports/get-sales-reports.use-case';
import { GetVehicleProfitabilityUseCase } from '../../src/application/reports/get-vehicle-profitability.use-case';
import type {
  AccountReceivable,
  FiscalDocumentsReportRow,
  InventoryStatusRow,
  MonthlyExpensesReportRow,
  MonthlyReturnsReportRow,
  MonthlySalesReportRow,
  SalespersonReportRow,
  VehicleProfitability,
} from '../../src/domain/reports/report.entity';
import type { ReportRepository } from '../../src/domain/reports/report.repository';
import { buildPaginatedResult, type PageQuery } from '../../src/domain/shared/pagination';

const PAGE: PageQuery = { page: 1, pageSize: 20 };

/**
 * Doble que registra con que argumentos lo llamaron.
 *
 * Los casos de uso de reportes no calculan: el calculo vive en las vistas SQL.
 * Lo que si es suyo —y lo que estas pruebas fijan— es el contrato: que los
 * filtros lleguen al repositorio SIN reinterpretar y que el resultado salga
 * envuelto en `ok`, incluso cuando no hay datos.
 */
class RecordingReportRepository implements ReportRepository {
  lastFilters: unknown;
  lastPage: PageQuery | undefined;

  constructor(
    private readonly rows: {
      profitability?: VehicleProfitability[];
      receivable?: AccountReceivable[];
      monthlySales?: MonthlySalesReportRow[];
      bySalesperson?: SalespersonReportRow[];
      returns?: MonthlyReturnsReportRow[];
      expenses?: MonthlyExpensesReportRow[];
      fiscal?: FiscalDocumentsReportRow[];
      inventory?: InventoryStatusRow[];
    } = {},
  ) {}

  async vehicleProfitability(filters: unknown, page: PageQuery) {
    this.lastFilters = filters;
    this.lastPage = page;
    return buildPaginatedResult(this.rows.profitability ?? [], 1, page);
  }

  async monthlyReturns(filters: unknown) {
    this.lastFilters = filters;
    return this.rows.returns ?? [];
  }

  async accountsReceivable(filters: unknown, page: PageQuery) {
    this.lastFilters = filters;
    this.lastPage = page;
    return buildPaginatedResult(this.rows.receivable ?? [], 1, page);
  }

  async monthlySales(filters: unknown) {
    this.lastFilters = filters;
    return this.rows.monthlySales ?? [];
  }

  async salesBySalesperson(filters: unknown) {
    this.lastFilters = filters;
    return this.rows.bySalesperson ?? [];
  }

  async monthlyExpenses(filters: unknown) {
    this.lastFilters = filters;
    return this.rows.expenses ?? [];
  }

  async fiscalDocuments(filters: unknown) {
    this.lastFilters = filters;
    return this.rows.fiscal ?? [];
  }

  async inventoryStatus() {
    return this.rows.inventory ?? [];
  }
}

describe('GetVehicleProfitabilityUseCase', () => {
  it('traslada filtros y paginacion al repositorio sin tocarlos', async () => {
    const reports = new RecordingReportRepository();
    const useCase = new GetVehicleProfitabilityUseCase(reports);

    const result = await useCase.execute({
      filters: { search: 'corolla', sold: true, status: 'sold' },
      page: PAGE,
    });

    expect(result.ok).toBe(true);
    expect(reports.lastFilters).toEqual({ search: 'corolla', sold: true, status: 'sold' });
    expect(reports.lastPage).toEqual(PAGE);
  });

  it('devuelve la pagina tal cual la arma el repositorio', async () => {
    const row = { vehicleId: 'veh-1', margin: 250_000 } as VehicleProfitability;
    const useCase = new GetVehicleProfitabilityUseCase(
      new RecordingReportRepository({ profitability: [row] }),
    );

    const result = await useCase.execute({ filters: {}, page: PAGE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([row]);
    expect(result.value.total).toBe(1);
  });
});

describe('GetAccountsReceivableUseCase', () => {
  it('conserva el filtro de saldo pendiente que decide el controlador', async () => {
    const reports = new RecordingReportRepository();
    const useCase = new GetAccountsReceivableUseCase(reports);

    const result = await useCase.execute({
      filters: { onlyPending: true, minDaysOutstanding: 30 },
      page: PAGE,
    });

    expect(result.ok).toBe(true);
    expect(reports.lastFilters).toEqual({ onlyPending: true, minDaysOutstanding: 30 });
  });
});

describe('Reportes agregados', () => {
  it('ventas por mes: pasa el rango y devuelve las filas', async () => {
    const row: MonthlySalesReportRow = {
      month: '2026-07-01',
      currencyCode: 'DOP',
      salesCount: 2,
      vehiclesCount: 3,
      totalAmount: 3_900_000,
      totalAmountConverted: 3_900_000,
    };
    const reports = new RecordingReportRepository({ monthlySales: [row] });

    const result = await new GetMonthlySalesReportUseCase(reports).execute({
      filters: { dateFrom: '2026-07-01', dateTo: '2026-07-31' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([row]);
    expect(reports.lastFilters).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-31' });
  });

  it('ventas por vendedor: acepta acotar a un vendedor', async () => {
    const reports = new RecordingReportRepository();

    const result = await new GetSalesBySalespersonReportUseCase(reports).execute({
      filters: { salespersonId: 'user-1', currencyCode: 'DOP' },
    });

    expect(result.ok).toBe(true);
    expect(reports.lastFilters).toEqual({ salespersonId: 'user-1', currencyCode: 'DOP' });
  });

  it('gastos por mes: acepta acotar por categoria y alcance', async () => {
    const reports = new RecordingReportRepository();

    const result = await new GetMonthlyExpensesReportUseCase(reports).execute({
      filters: { categoryId: 'cat-1', scope: 'vehicle' },
    });

    expect(result.ok).toBe(true);
    expect(reports.lastFilters).toEqual({ categoryId: 'cat-1', scope: 'vehicle' });
  });

  it('comprobantes fiscales: acepta acotar por tipo y estado', async () => {
    const reports = new RecordingReportRepository();

    const result = await new GetFiscalDocumentsReportUseCase(reports).execute({
      filters: { ncfType: 'E31', status: 'rejected', documentKind: 'invoice' },
    });

    expect(result.ok).toBe(true);
    expect(reports.lastFilters).toEqual({
      ncfType: 'E31',
      status: 'rejected',
      documentKind: 'invoice',
    });
  });

  it('inventario por estado: no recibe filtros y devuelve la foto completa', async () => {
    const inventory: InventoryStatusRow[] = [
      { status: 'in_inventory', vehicleCount: 3 },
      { status: 'sold', vehicleCount: 4 },
    ];

    const result = await new GetInventoryStatusReportUseCase(
      new RecordingReportRepository({ inventory }),
    ).execute();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(inventory);
  });

  it('un periodo sin movimiento es un reporte vacio, no un error', async () => {
    const result = await new GetMonthlySalesReportUseCase(
      new RecordingReportRepository(),
    ).execute({ filters: { dateFrom: '2020-01-01', dateTo: '2020-12-31' } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});
