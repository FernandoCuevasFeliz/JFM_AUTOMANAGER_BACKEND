/**
 * Tipos de e-CF de la DGII (Ley 32-23).
 *
 * El tipo determina el tratamiento fiscal del comprobante y no es
 * intercambiable: se elige segun quien es el receptor y para que usa la compra.
 */
export type NcfType = 'E31' | 'E32' | 'E34' | 'E44' | 'E45';

export const NCF_TYPES: readonly NcfType[] = ['E31', 'E32', 'E34', 'E44', 'E45'];

/** Descripcion de cada tipo, para mostrar en la interfaz. */
export const NCF_TYPE_LABELS: Readonly<Record<NcfType, string>> = {
  E31: 'Credito fiscal',
  E32: 'Consumo',
  E34: 'Nota de credito',
  E44: 'Regimen especial',
  E45: 'Gubernamental',
};

/** Estado de un documento fiscal frente a la DGII. */
export type FiscalDocStatus = 'pending' | 'issued' | 'rejected' | 'cancelled';

export const FISCAL_DOC_STATUSES: readonly FiscalDocStatus[] = [
  'pending',
  'issued',
  'rejected',
  'cancelled',
];

/**
 * Comprobante fiscal electronico de una venta.
 *
 * No tiene `deletedAt`: por ley un e-CF no se borra. Su ciclo de vida se
 * gobierna por completo con `status`.
 */
export interface Invoice {
  readonly id: string;
  readonly saleId: string;
  readonly ncfType: NcfType;
  /** `null` mientras el comprobante no ha sido aceptado por la DGII. */
  readonly ncfNumber: string | null;
  readonly status: FiscalDocStatus;
  readonly issuedAt: Date | null;
  /** Acuse de recibo que devuelve la DGII al aceptar el envio. */
  readonly dgiiTrackId: string | null;
  readonly xmlUrl: string | null;
  readonly rejectionReason: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Nota de credito (e-CF E34): corrige o anula una factura ya emitida. */
export interface CreditNote {
  readonly id: string;
  readonly invoiceId: string;
  readonly ncfNumber: string | null;
  readonly reason: string;
  readonly amount: number;
  readonly status: FiscalDocStatus;
  readonly issuedAt: Date | null;
  readonly dgiiTrackId: string | null;
  readonly xmlUrl: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InvoiceWithDetails extends Invoice {
  readonly saleNumber: string;
  readonly salePrice: number;
  readonly currencyCode: string;
  readonly saleDate: string;
  readonly saleStatus: string;
  readonly clientName: string;
  readonly clientDocumentNumber: string;
  readonly vehicleChassisNumber: string;
  readonly createdByName: string;
  readonly creditNotes: CreditNote[];
  /** Suma de las notas de credito EMITIDAS sobre esta factura. */
  readonly creditedAmount: number;
  /** Importe de la venta que sigue vigente tras las notas de credito. */
  readonly netAmount: number;
}

export interface NewInvoice {
  readonly saleId: string;
  readonly ncfType: NcfType;
  readonly createdBy: string;
}

export interface NewCreditNote {
  readonly invoiceId: string;
  readonly reason: string;
  readonly amount: number;
  readonly createdBy: string;
}

/** Datos que devuelve la DGII (o el PSFE) al aceptar un comprobante. */
export interface FiscalIssuance {
  readonly ncfNumber: string;
  readonly issuedAt: Date;
  readonly dgiiTrackId: string | null;
  readonly xmlUrl: string | null;
}

// ---------------------------------------------------------------------------
// Maquina de estados fiscal
// ---------------------------------------------------------------------------

/**
 * Transiciones validas de un documento fiscal:
 *
 *   pending ──► issued ──► cancelled   (anulado por nota de credito total)
 *      │  ▲        │
 *      │  │        └────────────────┐
 *      ▼  │                         │
 *   rejected ────────────────► cancelled
 *
 * - `pending`: creado en el sistema, todavia no aceptado por la DGII.
 * - `issued`: la DGII lo acepto; a partir de aqui tiene NCF y fecha de emision
 *   y ya no se puede modificar.
 * - `rejected`: la DGII lo rechazo. Se puede corregir y reintentar el envio,
 *   por eso vuelve a `pending`.
 * - `cancelled`: anulado. Es terminal.
 *
 * Una factura `issued` NO pasa a `cancelled` por voluntad de un usuario: solo
 * la lleva ahi una nota de credito que cubra su importe completo.
 */
export const FISCAL_DOC_TRANSITIONS: Readonly<Record<FiscalDocStatus, readonly FiscalDocStatus[]>> =
  {
    pending: ['issued', 'rejected', 'cancelled'],
    rejected: ['pending', 'cancelled'],
    issued: ['cancelled'],
    cancelled: [],
  };

export function canTransitionFiscalDocTo(from: FiscalDocStatus, to: FiscalDocStatus): boolean {
  if (from === to) {
    return false;
  }
  return FISCAL_DOC_TRANSITIONS[from].includes(to);
}

/** Un comprobante emitido es inmutable salvo por su anulacion. */
export function isFiscalDocEditable(status: FiscalDocStatus): boolean {
  return status === 'pending' || status === 'rejected';
}

/**
 * Solo se pueden emitir notas de credito contra una factura vigente: una
 * pendiente todavia no existe para la DGII, y una anulada ya no tiene importe
 * que corregir.
 */
export function acceptsCreditNotes(invoice: Invoice): boolean {
  return invoice.status === 'issued';
}

/** Suma de las notas de credito que ya surtieron efecto fiscal. */
export function creditedAmount(creditNotes: readonly CreditNote[]): number {
  return round2(
    creditNotes
      .filter((note) => note.status === 'issued')
      .reduce((total, note) => total + note.amount, 0),
  );
}

/**
 * Importe de la venta que sigue vigente. Nunca baja de cero: una nota de
 * credito no puede dejar la factura en negativo.
 */
export function netAmount(salePrice: number, credited: number): number {
  return round2(Math.max(salePrice - credited, 0));
}

/**
 * Una factura queda completamente anulada cuando las notas de credito cubren su
 * importe. Se admite un centavo de tolerancia para absorber el redondeo de
 * varias notas parciales.
 */
export function isFullyCredited(salePrice: number, credited: number): boolean {
  return credited + 0.01 >= salePrice;
}

/**
 * Formato de un NCF electronico: `E` + tipo (2 digitos) + secuencia (10
 * digitos). La columna admite 19 caracteres para tolerar los NCF del regimen
 * anterior, todavia presentes en documentos historicos.
 */
const NCF_PATTERN = /^E\d{12}$/;

export function isValidNcfNumber(ncfNumber: string): boolean {
  return NCF_PATTERN.test(ncfNumber.trim().toUpperCase());
}

/** El tipo declarado en la factura debe coincidir con el que codifica el NCF. */
export function ncfMatchesType(ncfNumber: string, ncfType: NcfType): boolean {
  return ncfNumber.trim().toUpperCase().startsWith(ncfType);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
