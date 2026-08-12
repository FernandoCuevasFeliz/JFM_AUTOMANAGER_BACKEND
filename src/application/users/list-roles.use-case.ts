import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import { type Permission, permissionsForRole } from '../../domain/users/permissions';
import type { Role, RoleRepository } from '../../domain/users/role.entity';
import type { UseCase } from '../shared/use-case';

export type RoleWithPermissions = Role & { readonly permissions: readonly Permission[] };

/**
 * Lista los roles del catalogo junto con los permisos que el codigo les
 * concede. Permite al frontend construir menus y ocultar acciones sin
 * duplicar el mapa de permisos.
 */
export class ListRolesUseCase implements UseCase<void, RoleWithPermissions[]> {
  constructor(private readonly roles: RoleRepository) {}

  async execute(): Promise<Result<RoleWithPermissions[], DomainError>> {
    const roles = await this.roles.listActive();
    return ok(roles.map((role) => ({ ...role, permissions: permissionsForRole(role.name) })));
  }
}
