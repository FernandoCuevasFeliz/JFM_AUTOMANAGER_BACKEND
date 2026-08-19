export type SaleStatus = 'in_process' | 'completed' | 'cancelled';

/**
 * Estado de una linea de venta.
 *
 * `returned` es definitivo y nunca borra la fila: el vehiculo volvio, pero la
 * operacion ocurrio y tiene que seguir siendo consultable. Una linea devuelta
 * sale del total vigente de la venta sin reescribir el historico.
 */
export type SaleItemStatus = 'active' | 'returned';

/** Una linea de venta = un vehiculo. */
export interface SaleItem {
  readonly id: string;
  readonly saleId: string;
  readonly vehicleId: string;
  readonly salePrice: number;
  readonly status: SaleItemStatus;
  readonly returnedAt: Date | null;
  readonly returnReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SaleItemWithDetails extends SaleItem {
  readonly vehicleChassisNumber: string;
  readonly vehicleBrandName: string;
  readonly vehicleModelName: string;
  readonly vehicleYear: number;
}

/**
 * Cabecera de la venta.
 *
 * `salePrice` NO es una columna: es la suma de las lineas vigentes, calculada al
 * leer. Guardarla ademas en la tabla habria creado dos fuentes del mismo dato
 * que se desincronizan en cuanto se devuelve un vehiculo.
 */
export interface Sale {
  readonly id: string;
  readonly saleNumber: string;
  readonly reservationId: string | null;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly currencyId: string;
  readonly exchangeRate: number;
  readonly saleDate: string;
  readonly status: SaleStatus;
  readonly salespersonId: string;
  readonly items: readonly SaleItem[];
  /** Derivado: suma de las lineas `active`. */
  readonly salePrice: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface SalePayment {
  readonly id: string;
  readonly saleId: string;
  readonly paymentMethodId: string;
  readonly currencyId: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly referenceNumber: string | null;
  readonly receivedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SalePaymentWithDetails extends SalePayment {
  readonly paymentMethodName: string;
  readonly currencyCode: string;
  readonly receivedByName: string;
}

/**
 * Dinero devuelto al cliente.
 *
 * Vive aparte de `sale_payments` a proposito: un abono negativo habria roto el
 * `CHECK (amount > 0)` de aquella tabla y, sobre todo, su significado. Un
 * reembolso lleva ademas su propia tasa —la del dia en que se devolvio el
 * dinero, no la de la venta— por el mismo criterio de costo historico que usan
 * compras y gastos.
 */
export interface Refund {
  readonly id: string;
  readonly saleId: string;
  /** `null` = reembolso general de la venta, no atado a una unidad devuelta. */
  readonly saleItemId: string | null;
  readonly refundMethodId: string;
  readonly currencyId: string;
  readonly amount: number;
  readonly exchangeRate: number;
  readonly refundDate: string;
  readonly reason: string;
  readonly processedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefundWithDetails extends Refund {
  readonly refundMethodName: string;
  readonly currencyCode: string;
  readonly processedByName: string;
  /** Chasis de la unidad devuelta; `null` en un reembolso general. */
  readonly vehicleChassisNumber: string | null;
}

export interface SaleWithDetails extends Sale {
  readonly clientName: string;
  readonly currencyCode: string;
  readonly salespersonName: string;
  readonly reservationNumber: string | null;
  readonly quotationNumber: string | null;
  readonly items: readonly SaleItemWithDetails[];
  readonly payments: readonly SalePaymentWithDetails[];
  readonly refunds: readonly RefundWithDetails[];
  /** Bruto cobrado. */
  readonly totalPaid: number;
  readonly totalRefunded: number;
  /** Cobrado menos devuelto: lo que la empresa realmente retiene. */
  readonly netPaid: number;
  readonly pendingBalance: number;
}

export interface NewSaleItem {
  readonly vehicleId: string;
  readonly salePrice: number;
}

export interface NewSale {
  readonly saleNumber: string;
  readonly reservationId: string | null;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly currencyId: string;
  readonly exchangeRate: number;
  readonly saleDate: string;
  readonly status: SaleStatus;
  readonly salespersonId: string;
}

export interface NewSalePayment {
  readonly saleId: string;
  readonly paymentMethodId: string;
  readonly currencyId: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly referenceNumber: string | null;
  readonly receivedBy: string;
}

export interface NewRefund {
  readonly saleId: string;
  readonly saleItemId: string | null;
  readonly refundMethodId: string;
  readonly currencyId: string;
  readonly amount: number;
  readonly exchangeRate: number;
  readonly refundDate: string;
  readonly reason: string;
  readonly processedBy: string;
}

export interface SaleUpdate {
  readonly exchangeRate?: number;
  readonly saleDate?: string;
  readonly salespersonId?: string;
}

/** Devolucion de una unidad: la linea guarda cuando y por que. */
export interface SaleItemReturn {
  readonly returnedAt: Date;
  readonly reason: string;
}

/**
 * Transiciones validas de una venta:
 *
 *   in_process --> completed --> cancelled (anulacion)
 *        |                          ^
 *        +--------------------------+
 *
 * `completed` exige que la venta este totalmente pagada (ver `isFullyPaid`).
 * `cancelled` devuelve TODOS los vehiculos a inventario. Devolver uno solo no
 * es una transicion de la venta: es marcar su linea como `returned`, y la venta
 * sigue viva con el resto.
 */
export const SALE_STATUS_TRANSITIONS: Readonly<Record<SaleStatus, readonly SaleStatus[]>> = {
  in_process: ['completed', 'cancelled'],
  completed: ['cancelled'],
  cancelled: [],
};

export function canTransitionSaleTo(from: SaleStatus, to: SaleStatus): boolean {
  if (from === to) {
    return false;
  }
  return SALE_STATUS_TRANSITIONS[from].includes(to);
}

// --- Lineas -----------------------------------------------------------------

export function isItemActive(item: { status: SaleItemStatus }): boolean {
  return item.status === 'active';
}

export function activeItems<T extends { status: SaleItemStatus }>(items: readonly T[]): T[] {
  return items.filter(isItemActive);
}

/** Total vigente de la venta: solo las lineas que siguen activas. */
export function saleTotal(items: readonly { status: SaleItemStatus; salePrice: number }[]): number {
  return round2(
    items.filter(isItemActive).reduce((total, item) => total + item.salePrice, 0),
  );
}

// --- Dinero -----------------------------------------------------------------

export function totalPaid(payments: readonly { amount: number }[]): number {
  return round2(payments.reduce((total, payment) => total + payment.amount, 0));
}

export function totalRefunded(refunds: readonly { amount: number }[]): number {
  return round2(refunds.reduce((total, refund) => total + refund.amount, 0));
}

/**
 * Cobrado neto: lo que entro menos lo que se devolvio.
 *
 * Es la cifra contra la que se mide el saldo. Sin restar los reembolsos, una
 * venta con un vehiculo devuelto y su dinero reintegrado seguiria figurando
 * como cobrada.
 */
export function netPaid(paid: number, refunded: number): number {
  return round2(paid - refunded);
}

export function pendingBalance(salePrice: number, paid: number): number {
  return round2(Math.max(salePrice - paid, 0));
}

/**
 * Se considera pagada con una tolerancia de un centavo para absorber el
 * redondeo de pagos parciales.
 */
export function isFullyPaid(salePrice: number, paid: number): boolean {
  return paid + 0.01 >= salePrice;
}

/** Una venta cancelada no admite mas pagos ni ediciones. */
export function acceptsPayments(sale: Pick<Sale, 'status'>): boolean {
  return sale.status === 'in_process';
}

export function isSaleEditable(sale: Pick<Sale, 'status'>): boolean {
  return sale.status === 'in_process';
}

/**
 * Un vehiculo se puede devolver mientras la venta no este cancelada: cancelar ya
 * devuelve todas las unidades de una vez, y volver a hacerlo linea por linea no
 * significa nada. Una venta `completed` SI admite devoluciones: es justo el caso
 * del cliente que se arrepiente despues de recibir el vehiculo.
 */
export function acceptsReturns(sale: Pick<Sale, 'status'>): boolean {
  return sale.status !== 'cancelled';
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
