import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type {
  Client,
  ClientUpdate,
  ClientWithDetails,
  NewClient,
} from '../../domain/clients/client.entity';
import type { ClientFilters, ClientRepository } from '../../domain/clients/client.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type { ClientsTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate } from './mappers';

function mapClient(row: Selectable<ClientsTable>): Client {
  return {
    id: row.id,
    clientType: row.client_type,
    documentTypeId: row.document_type_id,
    documentNumber: row.document_number,
    firstName: row.first_name,
    lastName: row.last_name,
    companyName: row.company_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

export class KyselyClientRepository implements ClientRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Client | null> {
    const row = await this.db
      .selectFrom('clients')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapClient(row);
  }

  async findByIdWithDetails(id: string): Promise<ClientWithDetails | null> {
    const row = await this.db
      .selectFrom('clients')
      .innerJoin('document_types', 'document_types.id', 'clients.document_type_id')
      .selectAll('clients')
      .select('document_types.name as document_type_name')
      .where('clients.id', '=', id)
      .where('clients.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined
      ? null
      : { ...mapClient(row), documentTypeName: row.document_type_name };
  }

  async existsByDocument(
    documentTypeId: string,
    documentNumber: string,
    excludeClientId?: string,
  ): Promise<boolean> {
    let query = this.db
      .selectFrom('clients')
      .select('id')
      .where('document_type_id', '=', documentTypeId)
      .where('document_number', '=', documentNumber);

    if (excludeClientId !== undefined) {
      query = query.where('id', '!=', excludeClientId);
    }

    return (await query.executeTakeFirst()) !== undefined;
  }

  async list(
    filters: ClientFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ClientWithDetails>> {
    let base = this.db
      .selectFrom('clients')
      .innerJoin('document_types', 'document_types.id', 'clients.document_type_id')
      .where('clients.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('clients.first_name', 'ilike', pattern),
          eb('clients.last_name', 'ilike', pattern),
          eb('clients.company_name', 'ilike', pattern),
          eb('clients.document_number', 'ilike', pattern),
          eb('clients.phone', 'ilike', pattern),
          eb('clients.email', 'ilike', pattern),
        ]),
      );
    }

    if (filters.clientType !== undefined) {
      base = base.where('clients.client_type', '=', filters.clientType);
    }
    if (filters.city !== undefined) {
      base = base.where('clients.city', 'ilike', likePattern(filters.city));
    }
    if (filters.isActive !== undefined) {
      base = base.where('clients.is_active', '=', filters.isActive);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('clients')
      .select('document_types.name as document_type_name')
      .orderBy('clients.last_name', 'asc')
      .orderBy('clients.company_name', 'asc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    const items = rows.map((row) => ({
      ...mapClient(row),
      documentTypeName: row.document_type_name,
    }));

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async create(data: NewClient): Promise<Client> {
    const row = await this.db
      .insertInto('clients')
      .values({
        client_type: data.clientType,
        document_type_id: data.documentTypeId,
        document_number: data.documentNumber,
        first_name: data.firstName,
        last_name: data.lastName,
        company_name: data.companyName,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        is_active: data.isActive,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapClient(row);
  }

  async update(id: string, data: ClientUpdate): Promise<Client | null> {
    const patch = {
      ...(data.clientType !== undefined ? { client_type: data.clientType } : {}),
      ...(data.documentTypeId !== undefined ? { document_type_id: data.documentTypeId } : {}),
      ...(data.documentNumber !== undefined ? { document_number: data.documentNumber } : {}),
      ...(data.firstName !== undefined ? { first_name: data.firstName } : {}),
      ...(data.lastName !== undefined ? { last_name: data.lastName } : {}),
      ...(data.companyName !== undefined ? { company_name: data.companyName } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('clients')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapClient(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('clients')
      .set({ deleted_at: sql<Date>`now()`, is_active: false })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async countCommercialRecords(clientId: string): Promise<number> {
    const [quotations, reservations, sales] = await Promise.all([
      this.db
        .selectFrom('quotations')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('client_id', '=', clientId)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('reservations')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('client_id', '=', clientId)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('sales')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('client_id', '=', clientId)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow(),
    ]);

    return Number(quotations.total) + Number(reservations.total) + Number(sales.total);
  }
}
