import type { ExpenseScope } from '../expenses/expense.entity';
import type { FiscalDocStatus, NcfType } from '../invoices/invoice.entity';
import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type { VehicleStatus } from '../vehicles/vehicle.entity';
import type {
  AccountReceivable,
  FiscalDocumentKind,
  FiscalDocumentsReportRow,
  InventoryStatusRow,
  MonthlyExpensesReportRow,
  MonthlySalesReportRow,
  SalespersonReportRow,
  VehicleProfitability,
} from './report.entity';

/**
 * Puerto de lectura de los reportes.
 *
 * Se separa de los repositorios de cada agregado a proposito: estos consultan
 * las VISTAS de la migracion 007, no las tablas, y no exponen ninguna escritura.
 * Un reporte no crea ni modifica nada, asi que el puerto solo tiene consultas.
 *
 * Convencion de los rangos: `dateFrom`/`dateTo` son fechas civiles
 * (`YYYY-MM-DD`) inclusivas por ambos extremos. En los reportes mensuales el
 * repositorio las lleva al primer dia de su mes, de modo que pedir desde el 15
 * de marzo incluye marzo completo; un mes parcial no existe en esas vistas.
 */

export interface VehicleProfitabilityFilters {
  /** Chasis, marca o modelo. */
  readonly search?: string;
  readonly status?: VehicleStatus;
  readonly vehicleId?: string;
  /** `true` deja solo las unidades ya vendidas; `false`, solo las no vendidas. */
  readonly sold?: boolean;
  /** Acota por fecha de venta (solo aplica a unidades vendidas). */
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface AccountsReceivableFilters {
  /** Numero de venta, nombre del cliente o chasis. */
  readonly search?: string;
  readonly clientId?: string;
  readonly salespersonId?: string;
  /** Oculta las ventas ya saldadas (saldo cero). */
  readonly onlyPending?: boolean;
  /** Antiguedad minima del saldo, en dias. */
  readonly minDaysOutstanding?: number;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface MonthlyRangeFilters {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly currencyCode?: string;
}

export interface SalespersonReportFilters extends MonthlyRangeFilters {
  readonly salespersonId?: string;
}

export interface MonthlyExpensesFilters extends MonthlyRangeFilters {
  readonly categoryId?: string;
  readonly scope?: ExpenseScope;
}

export interface FiscalDocumentsFilters {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly documentKind?: FiscalDocumentKind;
  readonly ncfType?: NcfType;
  readonly status?: FiscalDocStatus;
  readonly currencyCode?: string;
}

export interface ReportRepository {
  /**
   * Una fila por vehiculo: costo real contra precio de venta.
   * Paginado porque crece con el inventario.
   */
  vehicleProfitability(
    filters: VehicleProfitabilityFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<VehicleProfitability>>;

  /** Una fila por venta vigente con su saldo. Paginado: crece con las ventas. */
  accountsReceivable(
    filters: AccountsReceivableFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<AccountReceivable>>;

  /**
   * Los agregados mensuales no se paginan: su tamano lo acota el rango de
   * fechas (meses x moneda), no el volumen de operaciones.
   */
  monthlySales(filters: MonthlyRangeFilters): Promise<MonthlySalesReportRow[]>;
  salesBySalesperson(filters: SalespersonReportFilters): Promise<SalespersonReportRow[]>;
  monthlyExpenses(filters: MonthlyExpensesFilters): Promise<MonthlyExpensesReportRow[]>;
  fiscalDocuments(filters: FiscalDocumentsFilters): Promise<FiscalDocumentsReportRow[]>;

  /** Siempre devuelve todos los estados, incluidos los que estan en cero. */
  inventoryStatus(): Promise<InventoryStatusRow[]>;
}
