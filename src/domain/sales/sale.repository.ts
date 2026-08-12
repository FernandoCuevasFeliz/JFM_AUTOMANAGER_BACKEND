import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  NewSale,
  NewSalePayment,
  Sale,
  SalePayment,
  SalePaymentWithDetails,
  SaleStatus,
  SaleUpdate,
  SaleWithDetails,
} from './sale.entity';

export interface SaleFilters {
  readonly search?: string;
  readonly clientId?: string;
  readonly vehicleId?: string;
  readonly salespersonId?: string;
  readonly status?: SaleStatus;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface SalesSummary {
  readonly totalSales: number;
  readonly totalAmount: number;
  readonly totalCollected: number;
  readonly pendingBalance: number;
}

export interface SaleRepository {
  findById(id: string): Promise<Sale | null>;
  findByIdWithDetails(id: string): Promise<SaleWithDetails | null>;
  findByVehicleId(vehicleId: string): Promise<Sale | null>;
  existsByNumber(saleNumber: string): Promise<boolean>;
  /** UNIQUE de `sales.vehicle_id`: comprobacion previa al INSERT. */
  isVehicleSold(vehicleId: string): Promise<boolean>;
  list(filters: SaleFilters, page: PageQuery): Promise<PaginatedResult<SaleWithDetails>>;
  create(data: NewSale): Promise<Sale>;
  update(id: string, data: SaleUpdate): Promise<Sale | null>;
  updateStatus(id: string, status: SaleStatus): Promise<Sale | null>;
  /**
   * Borrado FISICO, unico del sistema. `sales.vehicle_id` es UNIQUE sin
   * condicion: mientras la fila exista (aunque este cancelada o marcada con
   * `deleted_at`) el vehiculo no puede volver a venderse. Por eso `sales` no
   * usa borrado logico; ver la nota del README sobre este constraint.
   */
  hardDelete(id: string): Promise<boolean>;
  summary(filters: SaleFilters): Promise<SalesSummary>;
  lastNumberForYear(yearPrefix: string): Promise<string | null>;

  // --- Pagos (parte del agregado Sale) -------------------------------------
  listPayments(saleId: string): Promise<SalePaymentWithDetails[]>;
  findPaymentById(paymentId: string): Promise<SalePayment | null>;
  addPayment(data: NewSalePayment): Promise<SalePayment>;
  deletePayment(paymentId: string): Promise<boolean>;
  totalPaid(saleId: string): Promise<number>;
}
