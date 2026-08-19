import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  NewRefund,
  NewSale,
  NewSaleItem,
  NewSalePayment,
  Refund,
  RefundWithDetails,
  Sale,
  SaleItem,
  SaleItemReturn,
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
 *
 * `totalVehicles` se separa de `totalSales` desde que una venta puede llevar
 * varios vehiculos: son dos cifras distintas y el tablero necesita las dos.
 */
export interface SalesSummary {
  readonly reportingCurrency: string;
  readonly totalSales: number;
  readonly totalVehicles: number;
  readonly totalAmount: number;
  readonly totalCollected: number;
  readonly totalRefunded: number;
  readonly pendingBalance: number;
}

export interface SaleRepository {
  findById(id: string): Promise<Sale | null>;
  findByIdWithDetails(id: string): Promise<SaleWithDetails | null>;
  /** Venta vigente que incluye el vehiculo, si la tiene. Ignora las canceladas. */
  findByVehicleId(vehicleId: string): Promise<Sale | null>;
  existsByNumber(saleNumber: string): Promise<boolean>;
  /**
   * `true` si el vehiculo esta en una linea VIGENTE de una venta viva.
   * Refleja el indice unico parcial `uq_sale_items_vehicle_active`.
   */
  isVehicleSold(vehicleId: string): Promise<boolean>;
  list(filters: SaleFilters, page: PageQuery): Promise<PaginatedResult<SaleWithDetails>>;
  create(data: NewSale): Promise<Sale>;
  update(id: string, data: SaleUpdate): Promise<Sale | null>;
  updateStatus(id: string, status: SaleStatus): Promise<Sale | null>;
  softDelete(id: string): Promise<boolean>;
  summary(filters: SaleFilters): Promise<SalesSummary>;
  lastNumberForYear(yearPrefix: string): Promise<string | null>;

  // --- Lineas (parte del agregado Sale) -------------------------------------
  listItems(saleId: string): Promise<SaleItem[]>;
  findItemById(saleItemId: string): Promise<SaleItem | null>;
  addItem(saleId: string, data: NewSaleItem): Promise<SaleItem>;
  updateItemPrice(saleItemId: string, salePrice: number): Promise<SaleItem | null>;
  /** Marca la linea como devuelta. No borra: la operacion ocurrio. */
  returnItem(saleItemId: string, data: SaleItemReturn): Promise<SaleItem | null>;
  /** Marca como devueltas todas las lineas vigentes (cancelacion de la venta). */
  returnAllItems(saleId: string, data: SaleItemReturn): Promise<SaleItem[]>;
  /** Borrado FISICO de una linea agregada por error a una venta en proceso. */
  removeItem(saleItemId: string): Promise<boolean>;

  // --- Pagos (parte del agregado Sale) -------------------------------------
  listPayments(saleId: string): Promise<SalePaymentWithDetails[]>;
  findPaymentById(paymentId: string): Promise<SalePayment | null>;
  addPayment(data: NewSalePayment): Promise<SalePayment>;
  deletePayment(paymentId: string): Promise<boolean>;
  totalPaid(saleId: string): Promise<number>;

  // --- Reembolsos (parte del agregado Sale) --------------------------------
  listRefunds(saleId: string): Promise<RefundWithDetails[]>;
  findRefundById(refundId: string): Promise<Refund | null>;
  addRefund(data: NewRefund): Promise<Refund>;
  totalRefunded(saleId: string): Promise<number>;
  /** Ya devuelto por una linea concreta; sirve para no reembolsarla dos veces. */
  refundedForItem(saleItemId: string): Promise<number>;
}
