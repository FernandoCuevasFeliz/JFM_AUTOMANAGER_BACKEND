export type ExpenseScope = 'general' | 'vehicle';

export interface Expense {
  readonly id: string;
  readonly categoryId: string;
  /** `null` = gasto general de la empresa; con valor = costo del vehiculo. */
  readonly vehicleId: string | null;
  readonly currencyId: string;
  readonly paymentMethodId: string;
  readonly description: string;
  readonly amount: number;
  /** Pesos por unidad de `currencyId`. Ver `domain/shared/money.ts`. */
  readonly exchangeRate: number;
  readonly expenseDate: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ExpenseWithDetails extends Expense {
  readonly categoryName: string;
  readonly categoryScope: ExpenseScope;
  readonly currencyCode: string;
  readonly paymentMethodName: string;
  readonly vehicleChassisNumber: string | null;
  readonly createdByName: string;
}

export interface NewExpense {
  readonly categoryId: string;
  readonly vehicleId: string | null;
  readonly currencyId: string;
  readonly paymentMethodId: string;
  readonly description: string;
  readonly amount: number;
  readonly exchangeRate: number;
  readonly expenseDate: string;
  readonly createdBy: string;
}

export interface ExpenseUpdate {
  readonly categoryId?: string;
  readonly vehicleId?: string | null;
  readonly currencyId?: string;
  readonly paymentMethodId?: string;
  readonly description?: string;
  readonly amount?: number;
  readonly exchangeRate?: number;
  readonly expenseDate?: string;
}

/**
 * Coherencia entre la categoria y el destino del gasto: una categoria con
 * `scope = 'vehicle'` (nacionalizacion, reparacion...) exige un vehiculo, y una
 * con `scope = 'general'` (nomina, alquiler) no admite ninguno. Sin esta regla
 * el costo real por unidad quedaria contaminado con gastos de la empresa.
 */
export function isExpenseScopeConsistent(scope: ExpenseScope, vehicleId: string | null): boolean {
  return scope === 'vehicle' ? vehicleId !== null : vehicleId === null;
}

/** Total de gastos de una moneda concreta, con su equivalente en reporte. */
export interface ExpenseCurrencyTotal {
  readonly currencyCode: string;
  /** Suma en la moneda original. */
  readonly total: number;
  /** La misma suma llevada a la moneda de reporte. */
  readonly totalConverted: number;
}

/**
 * Costo real acumulado de un vehiculo: importacion + gastos asociados,
 * contrastado con el precio al que se vendio.
 *
 * Los campos sin sufijo estan en la moneda original de cada documento; los que
 * llevan `Converted` estan en `reportingCurrency` y son los unicos que se
 * pueden sumar entre si.
 */
export interface VehicleCostSummary {
  readonly vehicleId: string;
  readonly reportingCurrency: string;

  // --- Importacion (`purchase_items` + la tasa de su compra) ---------------
  readonly purchaseCurrencyCode: string | null;
  readonly purchaseExchangeRate: number | null;
  readonly purchaseCost: number;
  readonly freightCost: number;
  readonly insuranceCost: number;
  readonly otherPurchaseCosts: number;
  readonly importSubtotal: number;
  readonly importSubtotalConverted: number;

  // --- Gastos imputados al vehiculo ---------------------------------------
  readonly expensesByCurrency: ExpenseCurrencyTotal[];
  readonly expensesTotalConverted: number;

  readonly totalCostConverted: number;

  // --- Contraste con el precio --------------------------------------------
  /**
   * Precio de lista sugerido. `vehicles.sale_price` no tiene moneda asociada en
   * el esquema; se interpreta en la moneda de reporte.
   */
  readonly listPrice: number | null;
  readonly saleCurrencyCode: string | null;
  readonly soldPrice: number | null;
  readonly soldPriceConverted: number | null;

  /** Margen en moneda de reporte; `null` si aun no se ha vendido. */
  readonly margin: number | null;
  readonly marginPercentage: number | null;
}
