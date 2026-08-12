import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type {
  NewQuotation,
  Quotation,
  QuotationStatus,
  QuotationUpdate,
  QuotationWithDetails,
} from '../../domain/quotations/quotation.entity';
import type {
  QuotationFilters,
  QuotationRepository,
} from '../../domain/quotations/quotation.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type { QuotationsTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate, toNumber } from './mappers';

/** Nombre visible del cliente: razon social para empresas, nombre para personas. */
const CLIENT_NAME = sql<string>`coalesce(clients.company_name, clients.first_name || ' ' || clients.last_name)`;
const USER_NAME = sql<string>`users.first_name || ' ' || users.last_name`;

function mapQuotation(row: Selectable<QuotationsTable>): Quotation {
  return {
    id: row.id,
    quotationNumber: row.quotation_number,
    clientId: row.client_id,
    vehicleId: row.vehicle_id,
    currencyId: row.currency_id,
    quotedPrice: toNumber(row.quoted_price),
    validUntil: row.valid_until,
    status: row.status,
    createdBy: row.created_by,
    notes: row.notes,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

type QuotationDetailRow = Selectable<QuotationsTable> & {
  client_name: string;
  chassis_number: string;
  brand_name: string;
  model_name: string;
  vehicle_year: number;
  currency_code: string;
  created_by_name: string;
};

function mapQuotationDetail(row: QuotationDetailRow): QuotationWithDetails {
  return {
    ...mapQuotation(row),
    clientName: row.client_name,
    vehicleChassisNumber: row.chassis_number,
    vehicleBrandName: row.brand_name,
    vehicleModelName: row.model_name,
    vehicleYear: row.vehicle_year,
    currencyCode: row.currency_code.trim(),
    createdByName: row.created_by_name,
  };
}

export class KyselyQuotationRepository implements QuotationRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Quotation | null> {
    const row = await this.db
      .selectFrom('quotations')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapQuotation(row);
  }

  async findByIdWithDetails(id: string): Promise<QuotationWithDetails | null> {
    const row = await this.detailQuery()
      .where('quotations.id', '=', id)
      .where('quotations.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapQuotationDetail(row);
  }

  async existsByNumber(quotationNumber: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('quotations')
      .select('id')
      .where('quotation_number', '=', quotationNumber)
      .executeTakeFirst();

    return row !== undefined;
  }

  async list(
    filters: QuotationFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<QuotationWithDetails>> {
    let base = this.baseJoin().where('quotations.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('quotations.quotation_number', 'ilike', pattern),
          eb('vehicles.chassis_number', 'ilike', pattern),
          eb('clients.company_name', 'ilike', pattern),
          eb('clients.first_name', 'ilike', pattern),
          eb('clients.last_name', 'ilike', pattern),
        ]),
      );
    }

    if (filters.clientId !== undefined) {
      base = base.where('quotations.client_id', '=', filters.clientId);
    }
    if (filters.vehicleId !== undefined) {
      base = base.where('quotations.vehicle_id', '=', filters.vehicleId);
    }
    if (filters.status !== undefined) {
      base = base.where('quotations.status', '=', filters.status);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('quotations.valid_until', '>=', filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      base = base.where('quotations.valid_until', '<=', filters.dateTo);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('quotations')
      .select(this.detailColumns())
      .orderBy('quotations.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    return buildPaginatedResult(rows.map(mapQuotationDetail), Number(totalRow.total), page);
  }

  async create(data: NewQuotation): Promise<Quotation> {
    const row = await this.db
      .insertInto('quotations')
      .values({
        quotation_number: data.quotationNumber,
        client_id: data.clientId,
        vehicle_id: data.vehicleId,
        currency_id: data.currencyId,
        quoted_price: data.quotedPrice,
        valid_until: data.validUntil,
        status: data.status,
        created_by: data.createdBy,
        notes: data.notes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapQuotation(row);
  }

  async update(id: string, data: QuotationUpdate): Promise<Quotation | null> {
    const patch = {
      ...(data.currencyId !== undefined ? { currency_id: data.currencyId } : {}),
      ...(data.quotedPrice !== undefined ? { quoted_price: data.quotedPrice } : {}),
      ...(data.validUntil !== undefined ? { valid_until: data.validUntil } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('quotations')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapQuotation(row);
  }

  async updateStatus(id: string, status: QuotationStatus): Promise<Quotation | null> {
    const row = await this.db
      .updateTable('quotations')
      .set({ status })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapQuotation(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('quotations')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async expireOverdue(today: string): Promise<number> {
    const result = await this.db
      .updateTable('quotations')
      .set({ status: 'expired' })
      .where('valid_until', '<', today)
      .where('status', 'in', ['pending', 'approved'])
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  async lastNumberForYear(yearPrefix: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('quotations')
      .select('quotation_number')
      .where('quotation_number', 'like', `${yearPrefix}%`)
      .orderBy('quotation_number', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row === undefined ? null : row.quotation_number;
  }

  private baseJoin() {
    return this.db
      .selectFrom('quotations')
      .innerJoin('clients', 'clients.id', 'quotations.client_id')
      .innerJoin('vehicles', 'vehicles.id', 'quotations.vehicle_id')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
      .innerJoin('currencies', 'currencies.id', 'quotations.currency_id')
      .innerJoin('users', 'users.id', 'quotations.created_by');
  }

  private detailColumns() {
    return [
      CLIENT_NAME.as('client_name'),
      sql<string>`vehicles.chassis_number`.as('chassis_number'),
      sql<string>`vehicle_brands.name`.as('brand_name'),
      sql<string>`vehicle_models.name`.as('model_name'),
      sql<number>`vehicles.year`.as('vehicle_year'),
      sql<string>`currencies.code`.as('currency_code'),
      USER_NAME.as('created_by_name'),
    ] as const;
  }

  private detailQuery() {
    return this.baseJoin().selectAll('quotations').select(this.detailColumns());
  }
}
