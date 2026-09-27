import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { RoleRepository, RoleWithPermissions } from '../../domain/users/role.entity';
import type { UseCase } from '../shared/use-case';

/**
 * Lista los roles junto con los permisos configurados en la base.
 */
export class ListRolesUseCase implements UseCase<void, RoleWithPermissions[]> {
  constructor(private readonly roles: RoleRepository) {}

  async execute(): Promise<Result<RoleWithPermissions[], DomainError>> {
    return ok(await this.roles.listActiveWithPermissions());
  }
}
