import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  NewPurchase,
  NewPurchaseItem,
  Purchase,
  PurchaseItem,
  PurchaseStatus,
  PurchaseUpdate,
  PurchaseWithDetails,
} from './purchase.entity';

export interface PurchaseFilters {
  readonly search?: string;
  readonly supplierId?: string;
  readonly status?: PurchaseStatus;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/**
 * Puerto del agregado Compra (`purchases` + `purchase_items`). El encabezado y
 * sus items se escriben siempre por el mismo repositorio para que puedan
 * compartir transaccion.
 */
export interface PurchaseRepository {
  findById(id: string): Promise<Purchase | null>;
  findByIdWithDetails(id: string): Promise<PurchaseWithDetails | null>;
  existsByPurchaseNumber(purchaseNumber: string, excludePurchaseId?: string): Promise<boolean>;
  list(filters: PurchaseFilters, page: PageQuery): Promise<PaginatedResult<PurchaseWithDetails>>;
  create(data: NewPurchase): Promise<Purchase>;
  update(id: string, data: PurchaseUpdate): Promise<Purchase | null>;
  updateStatus(id: string, status: PurchaseStatus): Promise<Purchase | null>;
  softDelete(id: string): Promise<boolean>;

  // --- Items ---------------------------------------------------------------
  listItems(purchaseId: string): Promise<PurchaseItem[]>;
  findItemById(itemId: string): Promise<PurchaseItem | null>;
  addItem(purchaseId: string, item: NewPurchaseItem): Promise<PurchaseItem>;
  removeItem(itemId: string): Promise<boolean>;
  /** UNIQUE de `purchase_items.vehicle_id`: un vehiculo se compra una sola vez. */
  isVehiclePurchased(vehicleId: string): Promise<boolean>;
  /** Ids de los vehiculos incluidos en la compra. */
  listVehicleIds(purchaseId: string): Promise<string[]>;
  /** Costo de importacion acumulado de un vehiculo (item de compra). */
  findItemByVehicleId(vehicleId: string): Promise<PurchaseItem | null>;
  /** Ultimo correlativo emitido en el ano, para generar el siguiente numero. */
  lastNumberForYear(yearPrefix: string): Promise<string | null>;
}
