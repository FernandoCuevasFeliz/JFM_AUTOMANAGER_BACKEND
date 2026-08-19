import type {
  CreditNote,
  FiscalDocStatus,
  FiscalIssuance,
  Invoice,
  InvoiceWithDetails,
  NcfType,
  NewCreditNote,
  NewInvoice,
} from '../../src/domain/invoices/invoice.entity';
import { creditedAmount, netAmount } from '../../src/domain/invoices/invoice.entity';
import type {
  InvoiceFilters,
  InvoiceRepository,
} from '../../src/domain/invoices/invoice.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
} from '../../src/domain/shared/pagination';

/** Doble en memoria del agregado Comprobante. */
export class FakeInvoiceRepository implements InvoiceRepository {
  readonly invoices = new Map<string, Invoice>();
  readonly creditNotes = new Map<string, CreditNote>();
  /** Precio de la venta asociada a cada factura, para el detalle. */
  readonly salePrices = new Map<string, number>();
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.invoices.get(id) ?? null;
  }

  async findByIdWithDetails(id: string): Promise<InvoiceWithDetails | null> {
    const invoice = this.invoices.get(id);
    if (invoice === undefined) {
      return null;
    }
    const notes = await this.listCreditNotes(id);
    const salePrice = this.salePrices.get(id) ?? 0;
    const credited = creditedAmount(notes);
    return {
      ...invoice,
      saleNumber: 'VEN-2026-000001',
      salePrice,
      currencyCode: 'DOP',
      saleDate: '2026-03-01',
      saleStatus: 'completed',
      clientName: 'Cliente de prueba',
      clientDocumentNumber: '402-1234567-8',
      vehicleChassisNumbers: ['JT2BF22K1X0111111'],
      createdByName: 'Administrador General',
      creditNotes: notes,
      creditedAmount: credited,
      netAmount: netAmount(salePrice, credited),
    };
  }

  async findBySaleId(saleId: string): Promise<Invoice | null> {
    return [...this.invoices.values()].find((i) => i.saleId === saleId) ?? null;
  }

  async existsByNcfNumber(ncfNumber: string): Promise<boolean> {
    const enFactura = [...this.invoices.values()].some((i) => i.ncfNumber === ncfNumber);
    const enNota = [...this.creditNotes.values()].some((n) => n.ncfNumber === ncfNumber);
    return enFactura || enNota;
  }

  async list(
    _filters: InvoiceFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<InvoiceWithDetails>> {
    const items: InvoiceWithDetails[] = [];
    for (const invoice of this.invoices.values()) {
      const detail = await this.findByIdWithDetails(invoice.id);
      if (detail !== null) {
        items.push(detail);
      }
    }
    return buildPaginatedResult(items, items.length, page);
  }

  async create(data: NewInvoice): Promise<Invoice> {
    const now = new Date('2026-03-01T10:00:00Z');
    const invoice: Invoice = {
      id: this.nextId('inv'),
      saleId: data.saleId,
      ncfType: data.ncfType,
      ncfNumber: null,
      status: 'pending',
      issuedAt: null,
      dgiiTrackId: null,
      xmlUrl: null,
      rejectionReason: null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async markIssued(id: string, issuance: FiscalIssuance): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (invoice === undefined) {
      return null;
    }
    const updated: Invoice = {
      ...invoice,
      status: 'issued',
      ncfNumber: issuance.ncfNumber,
      issuedAt: issuance.issuedAt,
      dgiiTrackId: issuance.dgiiTrackId,
      xmlUrl: issuance.xmlUrl,
      rejectionReason: null,
    };
    this.invoices.set(id, updated);
    return updated;
  }

  async markRejected(id: string, reason: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (invoice === undefined) {
      return null;
    }
    const updated: Invoice = { ...invoice, status: 'rejected', rejectionReason: reason };
    this.invoices.set(id, updated);
    return updated;
  }

  async updateStatus(id: string, status: FiscalDocStatus): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (invoice === undefined) {
      return null;
    }
    const updated: Invoice = { ...invoice, status };
    this.invoices.set(id, updated);
    return updated;
  }

  async updateNcfType(id: string, ncfType: NcfType): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (invoice === undefined) {
      return null;
    }
    const updated: Invoice = { ...invoice, ncfType };
    this.invoices.set(id, updated);
    return updated;
  }

  async listCreditNotes(invoiceId: string): Promise<CreditNote[]> {
    return [...this.creditNotes.values()].filter((n) => n.invoiceId === invoiceId);
  }

  async findCreditNoteById(creditNoteId: string): Promise<CreditNote | null> {
    return this.creditNotes.get(creditNoteId) ?? null;
  }

  async addCreditNote(data: NewCreditNote): Promise<CreditNote> {
    const now = new Date('2026-03-02T10:00:00Z');
    const note: CreditNote = {
      id: this.nextId('cn'),
      invoiceId: data.invoiceId,
      saleItemId: data.saleItemId,
      ncfNumber: null,
      reason: data.reason,
      amount: data.amount,
      status: 'pending',
      issuedAt: null,
      dgiiTrackId: null,
      xmlUrl: null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.creditNotes.set(note.id, note);
    return note;
  }

  async markCreditNoteIssued(
    creditNoteId: string,
    issuance: FiscalIssuance,
  ): Promise<CreditNote | null> {
    const note = this.creditNotes.get(creditNoteId);
    if (note === undefined) {
      return null;
    }
    const updated: CreditNote = {
      ...note,
      status: 'issued',
      ncfNumber: issuance.ncfNumber,
      issuedAt: issuance.issuedAt,
      dgiiTrackId: issuance.dgiiTrackId,
      xmlUrl: issuance.xmlUrl,
    };
    this.creditNotes.set(creditNoteId, updated);
    return updated;
  }

  async markCreditNoteRejected(creditNoteId: string): Promise<CreditNote | null> {
    const note = this.creditNotes.get(creditNoteId);
    if (note === undefined) {
      return null;
    }
    const updated: CreditNote = { ...note, status: 'rejected' };
    this.creditNotes.set(creditNoteId, updated);
    return updated;
  }

  async creditedAmount(invoiceId: string): Promise<number> {
    return creditedAmount(await this.listCreditNotes(invoiceId));
  }

  async creditedAmountForSaleItem(saleItemId: string): Promise<number> {
    return creditedAmount(
      [...this.creditNotes.values()].filter((note) => note.saleItemId === saleItemId),
    );
  }
}
