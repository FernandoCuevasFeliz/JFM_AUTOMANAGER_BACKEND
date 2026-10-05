import type { Selectable } from 'kysely';
import { isPermission, type Permission } from '../../domain/users/permissions';
import type { NewRole, Role, RoleRepository, RoleUpdate, RoleWithPermissions } from '../../domain/users/role.entity';
import type { Database } from '../database/connection';
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
  constructor(private readonly db: Database) {}

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

  async permissionsForRoleId(roleId: string): Promise<readonly Permission[]> {
    const rows = await this.db
      .selectFrom('role_permissions')
      .select('permission')
      .where('role_id', '=', roleId)
      .orderBy('permission', 'asc')
      .execute();

    return rows.map((row) => row.permission).filter(isPermission);
  }

  async listActiveWithPermissions(): Promise<RoleWithPermissions[]> {
    const roles = await this.listActive();
    const permissions = await this.db
      .selectFrom('role_permissions')
      .select(['role_id', 'permission'])
      .where('role_id', 'in', roles.map((role) => role.id))
      .orderBy('permission', 'asc')
      .execute();

    const byRole = new Map<string, Permission[]>();
    for (const row of permissions) {
      if (!isPermission(row.permission)) continue;
      const current = byRole.get(row.role_id) ?? [];
      current.push(row.permission);
      byRole.set(row.role_id, current);
    }

    return roles.map((role) => ({ ...role, permissions: byRole.get(role.id) ?? [] }));
  }

  async create(data: NewRole): Promise<RoleWithPermissions> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('roles')
        .values({ name: data.name, description: data.description })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (data.permissions.length > 0) {
        await trx
          .insertInto('role_permissions')
          .values(data.permissions.map((permission) => ({ role_id: row.id, permission })))
          .execute();
      }

      return { ...mapRole(row), permissions: data.permissions };
    });
  }

  async update(id: string, data: RoleUpdate): Promise<RoleWithPermissions | null> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('roles')
        .set({ name: data.name, description: data.description, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      if (row === undefined) return null;

      await trx.deleteFrom('role_permissions').where('role_id', '=', id).execute();
      if (data.permissions.length > 0) {
        await trx
          .insertInto('role_permissions')
          .values(data.permissions.map((permission) => ({ role_id: id, permission })))
          .execute();
      }

      return { ...mapRole(row), permissions: data.permissions };
    });
  }
}
