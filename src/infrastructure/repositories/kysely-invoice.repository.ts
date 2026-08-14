import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  creditedAmount as sumCreditNotes,
  type CreditNote,
  type FiscalDocStatus,
  type FiscalIssuance,
  type Invoice,
  type InvoiceWithDetails,
  type NcfType,
  netAmount,
  type NewCreditNote,
  type NewInvoice,
} from '../../domain/invoices/invoice.entity';
import type { InvoiceFilters, InvoiceRepository } from '../../domain/invoices/invoice.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type { CreditNotesTable, InvoicesTable } from '../database/database.types';
import { likePattern, round2, toDate, toNullableDate, toNumber } from './mappers';

const CLIENT_NAME = sql<string>`coalesce(clients.company_name, clients.first_name || ' ' || clients.last_name)`;
const USER_NAME = sql<string>`users.first_name || ' ' || users.last_name`;

function mapInvoice(row: Selectable<InvoicesTable>): Invoice {
  return {
    id: row.id,
    saleId: row.sale_id,
    ncfType: row.ncf_type,
    ncfNumber: row.ncf_number,
    status: row.status,
    issuedAt: toNullableDate(row.issued_at),
    dgiiTrackId: row.dgii_track_id,
    xmlUrl: row.xml_url,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapCreditNote(row: Selectable<CreditNotesTable>): CreditNote {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    ncfNumber: row.ncf_number,
    reason: row.reason,
    amount: toNumber(row.amount),
    status: row.status,
    issuedAt: toNullableDate(row.issued_at),
    dgiiTrackId: row.dgii_track_id,
    xmlUrl: row.xml_url,
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

type InvoiceDetailRow = Selectable<InvoicesTable> & {
  sale_number: string;
  sale_price: number | string;
  sale_date: string;
  sale_status: string;
  currency_code: string;
  client_name: string;
  client_document_number: string;
  chassis_number: string;
  created_by_name: string;
};

export class KyselyInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.db
      .selectFrom('invoices')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row === undefined ? null : mapInvoice(row);
  }

  async findByIdWithDetails(id: string): Promise<InvoiceWithDetails | null> {
    const row = await this.detailQuery().where('invoices.id', '=', id).executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    const creditNotes = await this.listCreditNotes(id);
    return this.mapDetail(row, creditNotes);
  }

  async findBySaleId(saleId: string): Promise<Invoice | null> {
    const row = await this.db
      .selectFrom('invoices')
      .selectAll()
      .where('sale_id', '=', saleId)
      .executeTakeFirst();

    return row === undefined ? null : mapInvoice(row);
  }

  /**
   * Busca en las DOS tablas: facturas y notas de credito comparten el espacio
   * de numeracion de la DGII, asi que un NCF usado en una nota tampoco puede
   * repetirse en una factura.
   */
  async existsByNcfNumber(ncfNumber: string): Promise<boolean> {
    const enFactura = await this.db
      .selectFrom('invoices')
      .select('id')
      .where('ncf_number', '=', ncfNumber)
      .executeTakeFirst();

    if (enFactura !== undefined) {
      return true;
    }

    const enNota = await this.db
      .selectFrom('credit_notes')
      .select('id')
      .where('ncf_number', '=', ncfNumber)
      .executeTakeFirst();

    return enNota !== undefined;
  }

  async list(
    filters: InvoiceFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<InvoiceWithDetails>> {
    let base = this.baseJoin();

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('invoices.ncf_number', 'ilike', pattern),
          eb('sales.sale_number', 'ilike', pattern),
          eb('clients.company_name', 'ilike', pattern),
          eb('clients.first_name', 'ilike', pattern),
          eb('clients.last_name', 'ilike', pattern),
          eb('clients.document_number', 'ilike', pattern),
        ]),
      );
    }

    if (filters.status !== undefined) {
      base = base.where('invoices.status', '=', filters.status);
    }
    if (filters.ncfType !== undefined) {
      base = base.where('invoices.ncf_type', '=', filters.ncfType);
    }
    if (filters.clientId !== undefined) {
      base = base.where('sales.client_id', '=', filters.clientId);
    }
    if (filters.saleId !== undefined) {
      base = base.where('invoices.sale_id', '=', filters.saleId);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('invoices.issued_at', '>=', sql<Date>`${filters.dateFrom}::date`);
    }
    if (filters.dateTo !== undefined) {
      // `+ 1 dia` para que el limite superior incluya la jornada completa: el
      // filtro es una fecha civil pero la columna es un instante.
      base = base.where('invoices.issued_at', '<', sql<Date>`${filters.dateTo}::date + 1`);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('invoices')
      .select(this.detailColumns())
      .orderBy('invoices.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    // Todas las notas de la pagina en una sola consulta (evita el N+1).
    const ids = rows.map((row) => row.id);
    const notasPorFactura = await this.groupCreditNotes(ids);

    const items = rows.map((row) => this.mapDetail(row, notasPorFactura.get(row.id) ?? []));

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async create(data: NewInvoice): Promise<Invoice> {
    const row = await this.db
      .insertInto('invoices')
      .values({
        sale_id: data.saleId,
        ncf_type: data.ncfType,
        created_by: data.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapInvoice(row);
  }

  async markIssued(id: string, issuance: FiscalIssuance): Promise<Invoice | null> {
    const row = await this.db
      .updateTable('invoices')
      .set({
        status: 'issued',
        ncf_number: issuance.ncfNumber,
        issued_at: issuance.issuedAt,
        dgii_track_id: issuance.dgiiTrackId,
        xml_url: issuance.xmlUrl,
        // Un envio aceptado deja sin sentido el motivo del rechazo anterior.
        rejection_reason: null,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapInvoice(row);
  }

  async markRejected(id: string, reason: string): Promise<Invoice | null> {
    const row = await this.db
      .updateTable('invoices')
      .set({ status: 'rejected', rejection_reason: reason })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapInvoice(row);
  }

  async updateStatus(id: string, status: FiscalDocStatus): Promise<Invoice | null> {
    const row = await this.db
      .updateTable('invoices')
      .set({ status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapInvoice(row);
  }

  async updateNcfType(id: string, ncfType: NcfType): Promise<Invoice | null> {
    const row = await this.db
      .updateTable('invoices')
      .set({ ncf_type: ncfType })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapInvoice(row);
  }

  async listCreditNotes(invoiceId: string): Promise<CreditNote[]> {
    return (await this.groupCreditNotes([invoiceId])).get(invoiceId) ?? [];
  }

  async findCreditNoteById(creditNoteId: string): Promise<CreditNote | null> {
    const row = await this.db
      .selectFrom('credit_notes')
      .selectAll()
      .where('id', '=', creditNoteId)
      .executeTakeFirst();

    return row === undefined ? null : mapCreditNote(row);
  }

  async addCreditNote(data: NewCreditNote): Promise<CreditNote> {
    const row = await this.db
      .insertInto('credit_notes')
      .values({
        invoice_id: data.invoiceId,
        reason: data.reason,
        amount: data.amount,
        created_by: data.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapCreditNote(row);
  }

  async markCreditNoteIssued(
    creditNoteId: string,
    issuance: FiscalIssuance,
  ): Promise<CreditNote | null> {
    const row = await this.db
      .updateTable('credit_notes')
      .set({
        status: 'issued',
        ncf_number: issuance.ncfNumber,
        issued_at: issuance.issuedAt,
        dgii_track_id: issuance.dgiiTrackId,
        xml_url: issuance.xmlUrl,
      })
      .where('id', '=', creditNoteId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapCreditNote(row);
  }

  async markCreditNoteRejected(creditNoteId: string): Promise<CreditNote | null> {
    const row = await this.db
      .updateTable('credit_notes')
      .set({ status: 'rejected' })
      .where('id', '=', creditNoteId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapCreditNote(row);
  }

  async creditedAmount(invoiceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('credit_notes')
      .select((eb) => eb.fn.sum<number>('amount').as('total'))
      .where('invoice_id', '=', invoiceId)
      .where('status', '=', 'issued')
      .executeTakeFirst();

    return round2(toNumber(row?.total ?? 0));
  }

  private baseJoin() {
    return this.db
      .selectFrom('invoices')
      .innerJoin('sales', 'sales.id', 'invoices.sale_id')
      .innerJoin('clients', 'clients.id', 'sales.client_id')
      .innerJoin('vehicles', 'vehicles.id', 'sales.vehicle_id')
      .innerJoin('currencies', 'currencies.id', 'sales.currency_id')
      .innerJoin('users', 'users.id', 'invoices.created_by');
  }

  private detailColumns() {
    return [
      sql<string>`sales.sale_number`.as('sale_number'),
      sql<number>`sales.sale_price`.as('sale_price'),
      sql<string>`sales.sale_date`.as('sale_date'),
      sql<string>`sales.status`.as('sale_status'),
      sql<string>`currencies.code`.as('currency_code'),
      CLIENT_NAME.as('client_name'),
      sql<string>`clients.document_number`.as('client_document_number'),
      sql<string>`vehicles.chassis_number`.as('chassis_number'),
      USER_NAME.as('created_by_name'),
    ] as const;
  }

  private detailQuery() {
    return this.baseJoin().selectAll('invoices').select(this.detailColumns());
  }

  private mapDetail(row: InvoiceDetailRow, creditNotes: CreditNote[]): InvoiceWithDetails {
    const salePrice = toNumber(row.sale_price);
    const credited = sumCreditNotes(creditNotes);

    return {
      ...mapInvoice(row),
      saleNumber: row.sale_number,
      salePrice,
      currencyCode: row.currency_code.trim(),
      saleDate: row.sale_date,
      saleStatus: row.sale_status,
      clientName: row.client_name,
      clientDocumentNumber: row.client_document_number,
      vehicleChassisNumber: row.chassis_number,
      createdByName: row.created_by_name,
      creditNotes,
      creditedAmount: credited,
      netAmount: netAmount(salePrice, credited),
    };
  }

  private async groupCreditNotes(invoiceIds: string[]): Promise<Map<string, CreditNote[]>> {
    const grouped = new Map<string, CreditNote[]>();

    if (invoiceIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .selectFrom('credit_notes')
      .selectAll()
      .where('invoice_id', 'in', invoiceIds)
      .orderBy('created_at', 'asc')
      .execute();

    for (const row of rows) {
      const bucket = grouped.get(row.invoice_id) ?? [];
      bucket.push(mapCreditNote(row));
      grouped.set(row.invoice_id, bucket);
    }

    return grouped;
  }
}
