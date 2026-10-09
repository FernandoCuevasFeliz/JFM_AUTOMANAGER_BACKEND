import { describe, expect, it } from 'vitest';
import { CreateRoleUseCase } from '../../src/application/users/create-role.use-case';
import { DeleteRoleUseCase } from '../../src/application/users/delete-role.use-case';
import { UpdateRoleUseCase } from '../../src/application/users/update-role.use-case';
import {
  ListAllActiveSessionsUseCase,
  RevokeSessionUseCase,
  RevokeUserSessionsUseCase,
} from '../../src/application/users/manage-sessions.use-case';
import type { NewRole, Role, RoleRepository, RoleWithPermissions } from '../../src/domain/users/role.entity';
import { FakeRefreshTokenRepository, FixedClock } from '../helpers/fake-auth';
import { FakeUserRepository, makeUserWithRole } from '../helpers/fake-auth';

class InMemoryRoles implements RoleRepository {
  readonly roles: RoleWithPermissions[] = [];

  async findById(id: string): Promise<Role | null> {
    return this.roles.find((role) => role.id === id) ?? null;
  }

  async findByName(name: string): Promise<Role | null> {
    return this.roles.find((role) => role.name === name) ?? null;
  }

  async listActive(): Promise<Role[]> { return this.roles; }
  async listActiveWithPermissions(): Promise<RoleWithPermissions[]> { return this.roles; }
  async permissionsForRoleId(id: string) { return this.roles.find((role) => role.id === id)?.permissions ?? []; }

  async create(data: NewRole): Promise<RoleWithPermissions> {
    const now = new Date('2026-09-27T00:00:00Z');
    const role = { id: `role-${this.roles.length + 1}`, ...data, isActive: true, createdAt: now, updatedAt: now };
    this.roles.push(role);
    return role;
  }

  async update(id: string, data: NewRole): Promise<RoleWithPermissions | null> {
    const index = this.roles.findIndex((role) => role.id === id);
    if (index < 0) return null;
    const updated = { ...this.roles[index], ...data, updatedAt: new Date('2026-10-05T00:00:00Z') };
    this.roles[index] = updated;
    return updated;
  }

  assignedUsers = new Map<string, number>();
  async countAssignedUsers(id: string): Promise<number> { return this.assignedUsers.get(id) ?? 0; }
  async delete(id: string): Promise<boolean> {
    const index = this.roles.findIndex((role) => role.id === id);
    if (index < 0) return false;
    this.roles.splice(index, 1);
    return true;
  }
}

describe('CreateRoleUseCase', () => {
  it('normaliza el nombre y conserva los permisos seleccionados', async () => {
    const repository = new InMemoryRoles();
    const result = await new CreateRoleUseCase(repository).execute({
      name: ' Supervisor_Ventas ',
      description: ' Supervisa el equipo ',
      permissions: ['sales:read', 'sales:read', 'reports:read'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('supervisor_ventas');
    expect(result.value.description).toBe('Supervisa el equipo');
    expect(result.value.permissions).toEqual(['sales:read', 'reports:read']);
  });

  it('rechaza nombres duplicados', async () => {
    const repository = new InMemoryRoles();
    const useCase = new CreateRoleUseCase(repository);
    await useCase.execute({ name: 'caja', description: null, permissions: ['payments:read'] });
    const duplicate = await useCase.execute({ name: 'caja', description: null, permissions: ['sales:read'] });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('CONFLICT');
  });
});

describe('UpdateRoleUseCase', () => {
  it('impide editar el rol del propio usuario autenticado', async () => {
    const repository = new InMemoryRoles();
    const role = await repository.create({ name: 'admin', description: null, permissions: ['users:write'] });
    const users = new FakeUserRepository([makeUserWithRole({ id: 'admin-1', roleId: role.id })]);

    const result = await new UpdateRoleUseCase(repository, users).execute({
      roleId: role.id,
      actorUserId: 'admin-1',
      name: 'admin',
      description: null,
      permissions: ['users:read'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(repository.roles[0]?.permissions).toEqual(['users:write']);
  });

  it('actualiza otro rol y sus permisos', async () => {
    const repository = new InMemoryRoles();
    const admin = await repository.create({ name: 'admin', description: null, permissions: ['users:write'] });
    const sales = await repository.create({ name: 'ventas', description: null, permissions: ['sales:read'] });
    const users = new FakeUserRepository([makeUserWithRole({ id: 'admin-1', roleId: admin.id })]);

    const result = await new UpdateRoleUseCase(repository, users).execute({
      roleId: sales.id,
      actorUserId: 'admin-1',
      name: ' Supervisor_Ventas ',
      description: ' Equipo comercial ',
      permissions: ['sales:read', 'sales:write'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('supervisor_ventas');
    expect(result.value.permissions).toEqual(['sales:read', 'sales:write']);
  });
});

describe('DeleteRoleUseCase', () => {
  it('elimina un rol sin usuarios asignados', async () => {
    const repository = new InMemoryRoles();
    const admin = await repository.create({ name: 'admin', description: null, permissions: ['users:write'] });
    const sales = await repository.create({ name: 'ventas', description: null, permissions: ['sales:read'] });
    const users = new FakeUserRepository([makeUserWithRole({ id: 'admin-1', roleId: admin.id })]);

    const result = await new DeleteRoleUseCase(repository, users).execute({
      roleId: sales.id,
      actorUserId: 'admin-1',
    });

    expect(result.ok).toBe(true);
    expect(await repository.findById(sales.id)).toBeNull();
  });

  it('protege el rol propio y los roles asignados', async () => {
    const repository = new InMemoryRoles();
    const admin = await repository.create({ name: 'admin', description: null, permissions: ['users:write'] });
    const sales = await repository.create({ name: 'ventas', description: null, permissions: ['sales:read'] });
    repository.assignedUsers.set(sales.id, 2);
    const users = new FakeUserRepository([makeUserWithRole({ id: 'admin-1', roleId: admin.id })]);
    const useCase = new DeleteRoleUseCase(repository, users);

    const ownResult = await useCase.execute({ roleId: admin.id, actorUserId: 'admin-1' });
    const assignedResult = await useCase.execute({ roleId: sales.id, actorUserId: 'admin-1' });

    expect(ownResult.ok).toBe(false);
    expect(assignedResult.ok).toBe(false);
    expect(repository.roles).toHaveLength(2);
  });
});

describe('Administracion de sesiones', () => {
  it('lista, revoca una sesion y revoca todas las de un usuario', async () => {
    const clock = new FixedClock(new Date('2026-09-27T12:00:00Z'));
    const repository = new FakeRefreshTokenRepository(clock);
    const expiry = new Date('2026-10-27T12:00:00Z');
    const first = await repository.create({ userId: 'user-1', tokenHash: 'a', expiresAt: expiry, userAgent: 'Chrome', ipAddress: '1.1.1.1' });
    await repository.create({ userId: 'user-1', tokenHash: 'b', expiresAt: expiry, userAgent: 'Firefox', ipAddress: '2.2.2.2' });

    const listed = await new ListAllActiveSessionsUseCase(repository).execute();
    expect(listed.ok && listed.value).toHaveLength(2);

    await new RevokeSessionUseCase(repository).execute({ sessionId: first.id });
    expect(repository.activeCount('user-1')).toBe(1);

    const revoked = await new RevokeUserSessionsUseCase(repository).execute({ userId: 'user-1' });
    expect(revoked.ok && revoked.value.revoked).toBe(1);
    expect(repository.activeCount('user-1')).toBe(0);
  });
});
