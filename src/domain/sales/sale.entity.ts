export type SaleStatus = 'in_process' | 'completed' | 'cancelled';

export interface Sale {
  readonly id: string;
  readonly saleNumber: string;
  readonly reservationId: string | null;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly currencyId: string;
  readonly salePrice: number;
  readonly exchangeRate: number;
  readonly saleDate: string;
  readonly status: SaleStatus;
  readonly salespersonId: string;
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

export interface SaleWithDetails extends Sale {
  readonly clientName: string;
  readonly vehicleChassisNumber: string;
  readonly vehicleBrandName: string;
  readonly vehicleModelName: string;
  readonly vehicleYear: number;
  readonly currencyCode: string;
  readonly salespersonName: string;
  readonly reservationNumber: string | null;
  readonly quotationNumber: string | null;
  readonly payments: SalePaymentWithDetails[];
  readonly totalPaid: number;
  readonly pendingBalance: number;
}

export interface NewSale {
  readonly saleNumber: string;
  readonly reservationId: string | null;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly currencyId: string;
  readonly salePrice: number;
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

export interface SaleUpdate {
  readonly salePrice?: number;
  readonly exchangeRate?: number;
  readonly saleDate?: string;
  readonly salespersonId?: string;
}

/**
 * Transiciones validas de una venta:
 *
 *   in_process --> completed --> cancelled (anulacion / devolucion)
 *        |                          ^
 *        +--------------------------+
 *
 * `completed` exige que la venta este totalmente pagada (ver `isFullyPaid`).
 * `cancelled` devuelve el vehiculo a inventario, que es la unica forma de
 * sacarlo del estado `sold`.
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

export function totalPaid(payments: readonly { amount: number }[]): number {
  return round2(payments.reduce((total, payment) => total + payment.amount, 0));
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
export function acceptsPayments(sale: Sale): boolean {
  return sale.status === 'in_process';
}

export function isSaleEditable(sale: Sale): boolean {
  return sale.status === 'in_process';
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
