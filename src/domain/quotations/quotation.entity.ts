export type QuotationStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'converted';

export interface Quotation {
  readonly id: string;
  readonly quotationNumber: string;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly currencyId: string;
  readonly quotedPrice: number;
  readonly validUntil: string;
  readonly status: QuotationStatus;
  readonly createdBy: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface QuotationWithDetails extends Quotation {
  readonly clientName: string;
  readonly vehicleChassisNumber: string;
  readonly vehicleBrandName: string;
  readonly vehicleModelName: string;
  readonly vehicleYear: number;
  readonly currencyCode: string;
  readonly createdByName: string;
}

export interface NewQuotation {
  readonly quotationNumber: string;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly currencyId: string;
  readonly quotedPrice: number;
  readonly validUntil: string;
  readonly status: QuotationStatus;
  readonly createdBy: string;
  readonly notes: string | null;
}

export interface QuotationUpdate {
  readonly currencyId?: string;
  readonly quotedPrice?: number;
  readonly validUntil?: string;
  readonly notes?: string | null;
}

/**
 * Transiciones validas de una cotizacion:
 *
 *   pending --> approved --> converted (terminal, al generar reserva o venta)
 *      |  \        |  \
 *      |   \       |   +--> expired (terminal)
 *      |    +------+------> rejected (terminal)
 *      +------------------> expired (terminal)
 *
 * `converted` solo lo fija el sistema al crear la reserva o la venta que nace
 * de la cotizacion, nunca un cambio manual.
 */
export const QUOTATION_STATUS_TRANSITIONS: Readonly<
  Record<QuotationStatus, readonly QuotationStatus[]>
> = {
  pending: ['approved', 'rejected', 'expired'],
  approved: ['converted', 'rejected', 'expired'],
  rejected: [],
  expired: [],
  converted: [],
};

export function canTransitionQuotationTo(from: QuotationStatus, to: QuotationStatus): boolean {
  if (from === to) {
    return false;
  }
  return QUOTATION_STATUS_TRANSITIONS[from].includes(to);
}

/** Una cotizacion vencida por fecha no puede convertirse aunque siga "approved". */
export function isExpired(quotation: Quotation, today: string): boolean {
  return quotation.validUntil < today;
}

/**
 * Solo una cotizacion vigente y aceptada por el cliente puede dar lugar a una
 * reserva o una venta.
 */
export function isConvertible(quotation: Quotation, today: string): boolean {
  return (
    quotation.deletedAt === null &&
    (quotation.status === 'approved' || quotation.status === 'pending') &&
    !isExpired(quotation, today)
  );
}

/** Solo se editan cotizaciones que aun no cerraron su ciclo. */
export function isQuotationEditable(quotation: Quotation): boolean {
  return quotation.status === 'pending' || quotation.status === 'approved';
}
