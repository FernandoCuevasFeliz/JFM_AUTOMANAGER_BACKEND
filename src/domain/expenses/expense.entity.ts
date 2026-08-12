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

/** Costo real acumulado de un vehiculo: importacion + gastos asociados. */
export interface VehicleCostSummary {
  readonly vehicleId: string;
  readonly purchaseCost: number;
  readonly freightCost: number;
  readonly insuranceCost: number;
  readonly otherPurchaseCosts: number;
  readonly expensesTotal: number;
  readonly totalCost: number;
  readonly listPrice: number | null;
  readonly soldPrice: number | null;
  /** Margen contra el precio de venta real; `null` si aun no se ha vendido. */
  readonly margin: number | null;
  readonly marginPercentage: number | null;
}
