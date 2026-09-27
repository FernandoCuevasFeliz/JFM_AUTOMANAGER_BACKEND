import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Permission } from '../../domain/users/permissions';
import type { RoleRepository, RoleWithPermissions } from '../../domain/users/role.entity';
import { RoleNameAlreadyInUseError } from '../../domain/users/user.errors';
import type { UseCase } from '../shared/use-case';

export interface CreateRoleInput {
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly Permission[];
}

export class CreateRoleUseCase implements UseCase<CreateRoleInput, RoleWithPermissions> {
  constructor(private readonly roles: RoleRepository) {}

  async execute(input: CreateRoleInput): Promise<Result<RoleWithPermissions, DomainError>> {
    const name = input.name.trim().toLowerCase();
    if (await this.roles.findByName(name)) {
      return err(new RoleNameAlreadyInUseError(name));
    }

    return ok(await this.roles.create({
      name,
      description: input.description?.trim() || null,
      permissions: [...new Set(input.permissions)],
    }));
  }
}
