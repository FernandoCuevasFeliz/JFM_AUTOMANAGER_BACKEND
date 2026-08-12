import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  Expense,
  ExpenseUpdate,
  ExpenseWithDetails,
  NewExpense,
  VehicleCostSummary,
} from './expense.entity';

export interface ExpenseFilters {
  readonly search?: string;
  readonly categoryId?: string;
  readonly vehicleId?: string;
  /** `true` = solo gastos generales, `false` = solo gastos de vehiculo. */
  readonly generalOnly?: boolean;
  readonly paymentMethodId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface ExpenseRepository {
  findById(id: string): Promise<Expense | null>;
  findByIdWithDetails(id: string): Promise<ExpenseWithDetails | null>;
  list(filters: ExpenseFilters, page: PageQuery): Promise<PaginatedResult<ExpenseWithDetails>>;
  create(data: NewExpense): Promise<Expense>;
  update(id: string, data: ExpenseUpdate): Promise<Expense | null>;
  softDelete(id: string): Promise<boolean>;
  /** Total de gastos imputados a un vehiculo. */
  sumByVehicle(vehicleId: string): Promise<number>;
  /** Costo real del vehiculo: compra + gastos, contra el precio de venta. */
  vehicleCostSummary(vehicleId: string): Promise<VehicleCostSummary | null>;
}
