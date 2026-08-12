/** Estados de una compra/importacion (`purchase_status_enum`). */
export type PurchaseStatus = 'pending' | 'in_transit' | 'received' | 'cancelled';

export interface Purchase {
  readonly id: string;
  readonly supplierId: string;
  readonly currencyId: string;
  readonly purchaseNumber: string;
  readonly invoiceNumber: string | null;
  /** Fecha civil `YYYY-MM-DD`. */
  readonly purchaseDate: string;
  readonly exchangeRate: number;
  readonly status: PurchaseStatus;
  readonly createdBy: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface PurchaseItem {
  readonly id: string;
  readonly purchaseId: string;
  readonly vehicleId: string;
  readonly unitCost: number;
  readonly freightCost: number;
  readonly insuranceCost: number;
  /** Aranceles y aduana previos a la nacionalizacion. */
  readonly otherCosts: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PurchaseItemWithVehicle extends PurchaseItem {
  readonly chassisNumber: string;
  readonly brandName: string;
  readonly modelName: string;
  readonly year: number;
}

export interface PurchaseWithDetails extends Purchase {
  readonly supplierName: string;
  readonly currencyCode: string;
  readonly createdByName: string;
  readonly items: PurchaseItemWithVehicle[];
  /** Suma de todos los costos de los items, en la moneda de la compra. */
  readonly totalCost: number;
}

export interface NewPurchase {
  readonly supplierId: string;
  readonly currencyId: string;
  readonly purchaseNumber: string;
  readonly invoiceNumber: string | null;
  readonly purchaseDate: string;
  readonly exchangeRate: number;
  readonly status: PurchaseStatus;
  readonly createdBy: string;
  readonly notes: string | null;
}

export interface NewPurchaseItem {
  readonly vehicleId: string;
  readonly unitCost: number;
  readonly freightCost: number;
  readonly insuranceCost: number;
  readonly otherCosts: number;
}

export interface PurchaseUpdate {
  readonly supplierId?: string;
  readonly currencyId?: string;
  readonly invoiceNumber?: string | null;
  readonly purchaseDate?: string;
  readonly exchangeRate?: number;
  readonly notes?: string | null;
}

/** Costo total de un item: valor del vehiculo mas todos sus costos de importacion. */
export function itemTotalCost(item: NewPurchaseItem | PurchaseItem): number {
  return round2(item.unitCost + item.freightCost + item.insuranceCost + item.otherCosts);
}

export function purchaseTotalCost(items: readonly (NewPurchaseItem | PurchaseItem)[]): number {
  return round2(items.reduce((total, item) => total + itemTotalCost(item), 0));
}

/**
 * Transiciones validas de una compra:
 *
 *   pending --> in_transit --> received (terminal)
 *      |            |
 *      +------------+--------> cancelled (terminal)
 *
 * `received` marca la llegada fisica de la mercancia: es el momento en que los
 * vehiculos de la compra entran a inventario.
 */
export const PURCHASE_STATUS_TRANSITIONS: Readonly<
  Record<PurchaseStatus, readonly PurchaseStatus[]>
> = {
  pending: ['in_transit', 'received', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function canTransitionPurchaseTo(from: PurchaseStatus, to: PurchaseStatus): boolean {
  if (from === to) {
    return false;
  }
  return PURCHASE_STATUS_TRANSITIONS[from].includes(to);
}

/** Una compra cerrada (recibida o cancelada) ya no admite cambios de contenido. */
export function isPurchaseEditable(purchase: Purchase): boolean {
  return purchase.status === 'pending' || purchase.status === 'in_transit';
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
