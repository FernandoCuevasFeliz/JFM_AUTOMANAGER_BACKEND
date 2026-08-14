import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  CreditNote,
  FiscalDocStatus,
  FiscalIssuance,
  Invoice,
  InvoiceWithDetails,
  NcfType,
  NewCreditNote,
  NewInvoice,
} from './invoice.entity';

export interface InvoiceFilters {
  /** Busqueda libre sobre NCF, numero de venta y cliente. */
  readonly search?: string;
  readonly status?: FiscalDocStatus;
  readonly ncfType?: NcfType;
  readonly clientId?: string;
  readonly saleId?: string;
  /** Rango sobre `issued_at`. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/**
 * Puerto del agregado Comprobante (`invoices` + `credit_notes`).
 *
 * No expone borrado: un documento fiscal no se elimina ni logica ni
 * fisicamente. Todo cambio pasa por `updateStatus` o por una nota de credito.
 */
export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByIdWithDetails(id: string): Promise<InvoiceWithDetails | null>;
  findBySaleId(saleId: string): Promise<Invoice | null>;
  existsByNcfNumber(ncfNumber: string): Promise<boolean>;
  list(filters: InvoiceFilters, page: PageQuery): Promise<PaginatedResult<InvoiceWithDetails>>;
  create(data: NewInvoice): Promise<Invoice>;
  /** Registra la aceptacion de la DGII: numero, fecha y acuse. */
  markIssued(id: string, issuance: FiscalIssuance): Promise<Invoice | null>;
  markRejected(id: string, reason: string): Promise<Invoice | null>;
  updateStatus(id: string, status: FiscalDocStatus): Promise<Invoice | null>;
  /** Permite corregir el tipo mientras el comprobante no este emitido. */
  updateNcfType(id: string, ncfType: NcfType): Promise<Invoice | null>;

  // --- Notas de credito (parte del agregado) --------------------------------
  listCreditNotes(invoiceId: string): Promise<CreditNote[]>;
  findCreditNoteById(creditNoteId: string): Promise<CreditNote | null>;
  addCreditNote(data: NewCreditNote): Promise<CreditNote>;
  markCreditNoteIssued(creditNoteId: string, issuance: FiscalIssuance): Promise<CreditNote | null>;
  /**
   * Solo cambia el estado: `credit_notes` no tiene columna para el motivo del
   * rechazo (a diferencia de `invoices.rejection_reason`), asi que el detalle
   * que devuelva la DGII queda unicamente en el log de la aplicacion.
   */
  markCreditNoteRejected(creditNoteId: string): Promise<CreditNote | null>;
  /** Total ya acreditado (solo notas emitidas) sobre una factura. */
  creditedAmount(invoiceId: string): Promise<number>;
}
