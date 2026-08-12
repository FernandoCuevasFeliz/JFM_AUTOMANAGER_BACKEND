import type { Selectable } from 'kysely';
import type { Role, RoleRepository } from '../../domain/users/role.entity';
import type { Executor } from '../database/connection';
import type { RolesTable } from '../database/database.types';
import { toDate } from './mappers';

function mapRole(row: Selectable<RolesTable>): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class KyselyRoleRepository implements RoleRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Role | null> {
    const row = await this.db
      .selectFrom('roles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row === undefined ? null : mapRole(row);
  }

  async findByName(name: string): Promise<Role | null> {
    const row = await this.db
      .selectFrom('roles')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();

    return row === undefined ? null : mapRole(row);
  }

  async listActive(): Promise<Role[]> {
    const rows = await this.db
      .selectFrom('roles')
      .selectAll()
      .where('is_active', '=', true)
      .orderBy('name', 'asc')
      .execute();

    return rows.map(mapRole);
  }
}
