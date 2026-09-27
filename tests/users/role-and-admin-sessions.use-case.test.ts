import { describe, expect, it } from 'vitest';
import { CreateRoleUseCase } from '../../src/application/users/create-role.use-case';
import {
  ListAllActiveSessionsUseCase,
  RevokeSessionUseCase,
  RevokeUserSessionsUseCase,
} from '../../src/application/users/manage-sessions.use-case';
import type { NewRole, Role, RoleRepository, RoleWithPermissions } from '../../src/domain/users/role.entity';
import { FakeRefreshTokenRepository, FixedClock } from '../helpers/fake-auth';

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
