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

/**
 * Totales del periodo, consolidados en la moneda de reporte con la tasa
 * registrada en cada venta (ver `domain/shared/money.ts`). Las ventas en
 * dolares y en pesos son asi sumables entre si.
 */
export interface SalesSummary {
  readonly reportingCurrency: string;
  readonly totalSales: number;
  readonly totalAmount: number;
  readonly totalCollected: number;
  readonly pendingBalance: number;
}

export interface SaleRepository {
  findById(id: string): Promise<Sale | null>;
  findByIdWithDetails(id: string): Promise<SaleWithDetails | null>;
  /** Venta vigente del vehiculo, si la tiene. Ignora las canceladas. */
  findByVehicleId(vehicleId: string): Promise<Sale | null>;
  existsByNumber(saleNumber: string): Promise<boolean>;
  /**
   * `true` si el vehiculo tiene una venta VIGENTE (ni cancelada ni borrada).
   * Refleja el indice unico parcial `uq_sales_vehicle_active`.
   */
  isVehicleSold(vehicleId: string): Promise<boolean>;
  list(filters: SaleFilters, page: PageQuery): Promise<PaginatedResult<SaleWithDetails>>;
  create(data: NewSale): Promise<Sale>;
  update(id: string, data: SaleUpdate): Promise<Sale | null>;
  updateStatus(id: string, status: SaleStatus): Promise<Sale | null>;
  softDelete(id: string): Promise<boolean>;
  summary(filters: SaleFilters): Promise<SalesSummary>;
  lastNumberForYear(yearPrefix: string): Promise<string | null>;

  // --- Pagos (parte del agregado Sale) -------------------------------------
  listPayments(saleId: string): Promise<SalePaymentWithDetails[]>;
  findPaymentById(paymentId: string): Promise<SalePayment | null>;
  addPayment(data: NewSalePayment): Promise<SalePayment>;
  deletePayment(paymentId: string): Promise<boolean>;
  totalPaid(saleId: string): Promise<number>;
}
