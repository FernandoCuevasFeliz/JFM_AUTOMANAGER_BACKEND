import type { ExpenseScope } from '../expenses/expense.entity';
import type { FiscalDocStatus, NcfType } from '../invoices/invoice.entity';
import type { SaleStatus } from '../sales/sale.entity';
import type { VehicleStatus } from '../vehicles/vehicle.entity';

/**
 * Modelos de LECTURA de los reportes.
 *
 * A diferencia del resto del dominio, aqui no hay entidades con reglas ni
 * comportamiento: un reporte es una fotografia agregada que ya no se puede
 * modificar. Por eso son interfaces planas, y por eso el modulo no tiene
 * `report.errors.ts`: consultar un reporte no viola ninguna regla de negocio.
 *
 * Cada fila trae los importes en la moneda del documento (`currencyCode`) y su
 * equivalente en la moneda de reporte (sufijo `Converted`), calculado con la
 * tasa registrada en cada documento (ver `domain/shared/money.ts`). Solo los
 * `Converted` son sumables entre monedas distintas.
 */

/** Un mes de calendario, expresado como su primer dia: `YYYY-MM-01`. */
export type ReportMonth = string;

// --- Rentabilidad por vehiculo ---------------------------------------------

export interface VehicleProfitability {
  readonly vehicleId: string;
  readonly chassisNumber: string;
  readonly brandName: string;
  readonly modelName: string;
  readonly year: number;
  readonly status: VehicleStatus;
  readonly isActive: boolean;
  /** Precio de lista del inventario; no es lo que se cobro. */
  readonly listPrice: number | null;
  readonly purchaseCurrencyCode: string | null;
  readonly purchaseExchangeRate: number | null;
  readonly importSubtotal: number;
  readonly importSubtotalConverted: number;
  readonly expensesTotalConverted: number;
  readonly totalCostConverted: number;
  /** Todo lo relativo a la venta es null mientras la unidad no se venda. */
  readonly saleId: string | null;
  readonly saleNumber: string | null;
  readonly saleStatus: SaleStatus | null;
  readonly saleDate: string | null;
  readonly saleCurrencyCode: string | null;
  readonly soldPrice: number | null;
  readonly soldPriceConverted: number | null;
  readonly margin: number | null;
  /** Null tambien cuando el costo es cero: el porcentaje no estaria definido. */
  readonly marginPercentage: number | null;
}

// --- Cuentas por cobrar -----------------------------------------------------

export interface AccountReceivable {
  readonly saleId: string;
  readonly saleNumber: string;
  readonly saleDate: string;
  readonly saleStatus: SaleStatus;
  readonly clientId: string;
  readonly clientName: string;
  readonly clientPhone: string;
  readonly vehicleId: string;
  readonly chassisNumber: string;
  readonly salespersonId: string;
  readonly salespersonName: string;
  readonly currencyCode: string;
  readonly exchangeRate: number;
  readonly salePrice: number;
  readonly totalPaid: number;
  readonly pendingBalance: number;
  readonly pendingBalanceConverted: number;
  /** Dias transcurridos desde la fecha de la venta. */
  readonly daysOutstanding: number;
}

// --- Ventas -----------------------------------------------------------------

export interface MonthlySalesReportRow {
  readonly month: ReportMonth;
  readonly currencyCode: string;
  readonly salesCount: number;
  readonly totalAmount: number;
  readonly totalAmountConverted: number;
}

export interface SalespersonReportRow extends MonthlySalesReportRow {
  readonly salespersonId: string;
  readonly salespersonName: string;
}

// --- Gastos -----------------------------------------------------------------

export interface MonthlyExpensesReportRow {
  readonly month: ReportMonth;
  readonly categoryId: string;
  readonly categoryName: string;
  /** Alcance real del gasto: `vehicle` si quedo imputado a una unidad. */
  readonly scope: ExpenseScope;
  readonly currencyCode: string;
  readonly expenseCount: number;
  readonly totalAmount: number;
  readonly totalAmountConverted: number;
}

// --- Inventario -------------------------------------------------------------

export interface InventoryStatusRow {
  readonly status: VehicleStatus;
  readonly vehicleCount: number;
}

// --- Comprobantes fiscales --------------------------------------------------

export type FiscalDocumentKind = 'invoice' | 'credit_note';

export const FISCAL_DOCUMENT_KINDS: readonly FiscalDocumentKind[] = ['invoice', 'credit_note'];

export interface FiscalDocumentsReportRow {
  /** Mes de emision; el de registro mientras el comprobante siga sin emitirse. */
  readonly month: ReportMonth;
  readonly documentKind: FiscalDocumentKind;
  /** Las notas de credito son siempre E34. */
  readonly ncfType: NcfType;
  readonly status: FiscalDocStatus;
  readonly currencyCode: string;
  readonly documentCount: number;
  readonly totalAmount: number;
  readonly totalAmountConverted: number;
}
