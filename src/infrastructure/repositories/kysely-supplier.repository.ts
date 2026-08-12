import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { NewSupplier, Supplier, SupplierUpdate } from '../../domain/suppliers/supplier.entity';
import type {
  SupplierFilters,
  SupplierRepository,
} from '../../domain/suppliers/supplier.repository';
import type { Executor } from '../database/connection';
import type { SuppliersTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate } from './mappers';

function mapSupplier(row: Selectable<SuppliersTable>): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    documentNumber: row.document_number,
    email: row.email,
    phone: row.phone,
    address: row.address,
    country: row.country,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

export class KyselySupplierRepository implements SupplierRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Supplier | null> {
    const row = await this.db
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapSupplier(row);
  }

  async existsByName(name: string, excludeSupplierId?: string): Promise<boolean> {
    let query = this.db
      .selectFrom('suppliers')
      .select('id')
      .where('name', 'ilike', name)
      .where('deleted_at', 'is', null);

    if (excludeSupplierId !== undefined) {
      query = query.where('id', '!=', excludeSupplierId);
    }

    return (await query.executeTakeFirst()) !== undefined;
  }

  async list(filters: SupplierFilters, page: PageQuery): Promise<PaginatedResult<Supplier>> {
    let base = this.db.selectFrom('suppliers').where('deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('name', 'ilike', pattern),
          eb('contact_name', 'ilike', pattern),
          eb('document_number', 'ilike', pattern),
          eb('email', 'ilike', pattern),
        ]),
      );
    }

    if (filters.country !== undefined) {
      base = base.where('country', 'ilike', likePattern(filters.country));
    }
    if (filters.isActive !== undefined) {
      base = base.where('is_active', '=', filters.isActive);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll()
      .orderBy('name', 'asc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    return buildPaginatedResult(rows.map(mapSupplier), Number(totalRow.total), page);
  }

  async create(data: NewSupplier): Promise<Supplier> {
    const row = await this.db
      .insertInto('suppliers')
      .values({
        name: data.name,
        contact_name: data.contactName,
        document_number: data.documentNumber,
        email: data.email,
        phone: data.phone,
        address: data.address,
        country: data.country,
        is_active: data.isActive,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapSupplier(row);
  }

  async update(id: string, data: SupplierUpdate): Promise<Supplier | null> {
    const patch = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.contactName !== undefined ? { contact_name: data.contactName } : {}),
      ...(data.documentNumber !== undefined ? { document_number: data.documentNumber } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('suppliers')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapSupplier(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('suppliers')
      .set({ deleted_at: sql<Date>`now()`, is_active: false })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async countPurchases(supplierId: string): Promise<number> {
    const row = await this.db
      .selectFrom('purchases')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('supplier_id', '=', supplierId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    return Number(row.total);
  }
}
