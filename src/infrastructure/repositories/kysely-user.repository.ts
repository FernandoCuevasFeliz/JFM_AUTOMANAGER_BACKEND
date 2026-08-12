import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { NewUser, User, UserUpdate, UserWithRole } from '../../domain/users/user.entity';
import type { UserFilters, UserRepository } from '../../domain/users/user.repository';
import type { Executor } from '../database/connection';
import type { UsersTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate } from './mappers';

type UserRow = Selectable<UsersTable>;

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    roleId: row.role_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    passwordHash: row.password_hash,
    phone: row.phone,
    isActive: row.is_active,
    lastLoginAt: toNullableDate(row.last_login_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

function mapUserWithRole(row: UserRow & { role_name: string }): UserWithRole {
  return { ...mapUser(row), roleName: row.role_name };
}

export class KyselyUserRepository implements UserRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapUser(row);
  }

  async findByIdWithRole(id: string): Promise<UserWithRole | null> {
    const row = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .selectAll('users')
      .select('roles.name as role_name')
      .where('users.id', '=', id)
      .where('users.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapUserWithRole(row);
  }

  async findByEmail(email: string): Promise<UserWithRole | null> {
    const row = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .selectAll('users')
      .select('roles.name as role_name')
      .where('users.email', '=', email)
      .where('users.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapUserWithRole(row);
  }

  async existsByEmail(email: string, excludeUserId?: string): Promise<boolean> {
    let query = this.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .where('deleted_at', 'is', null);

    if (excludeUserId !== undefined) {
      query = query.where('id', '!=', excludeUserId);
    }

    return (await query.executeTakeFirst()) !== undefined;
  }

  async list(filters: UserFilters, page: PageQuery): Promise<PaginatedResult<UserWithRole>> {
    let base = this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .where('users.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('users.first_name', 'ilike', pattern),
          eb('users.last_name', 'ilike', pattern),
          eb('users.email', 'ilike', pattern),
        ]),
      );
    }

    if (filters.roleId !== undefined) {
      base = base.where('users.role_id', '=', filters.roleId);
    }

    if (filters.isActive !== undefined) {
      base = base.where('users.is_active', '=', filters.isActive);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('users')
      .select('roles.name as role_name')
      .orderBy('users.last_name', 'asc')
      .orderBy('users.first_name', 'asc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    return buildPaginatedResult(rows.map(mapUserWithRole), Number(totalRow.total), page);
  }

  async create(data: NewUser): Promise<User> {
    const row = await this.db
      .insertInto('users')
      .values({
        role_id: data.roleId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        password_hash: data.passwordHash,
        phone: data.phone,
        is_active: data.isActive,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapUser(row);
  }

  async update(id: string, data: UserUpdate): Promise<User | null> {
    const patch = {
      ...(data.roleId !== undefined ? { role_id: data.roleId } : {}),
      ...(data.firstName !== undefined ? { first_name: data.firstName } : {}),
      ...(data.lastName !== undefined ? { last_name: data.lastName } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.passwordHash !== undefined ? { password_hash: data.passwordHash } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('users')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapUser(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('users')
      .set({ deleted_at: sql<Date>`now()`, is_active: false })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    await this.db.updateTable('users').set({ last_login_at: at }).where('id', '=', id).execute();
  }
}
