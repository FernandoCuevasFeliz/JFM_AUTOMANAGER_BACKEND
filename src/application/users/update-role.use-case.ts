import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Permission } from '../../domain/users/permissions';
import type { RoleRepository, RoleWithPermissions } from '../../domain/users/role.entity';
import type { UserRepository } from '../../domain/users/user.repository';
import {
  CannotEditOwnRoleError,
  RoleNameAlreadyInUseError,
  RoleNotFoundError,
  UserNotFoundError,
} from '../../domain/users/user.errors';
import type { UseCase } from '../shared/use-case';

export interface UpdateRoleInput {
  readonly roleId: string;
  readonly actorUserId: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly Permission[];
}

export class UpdateRoleUseCase implements UseCase<UpdateRoleInput, RoleWithPermissions> {
  constructor(
    private readonly roles: RoleRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(input: UpdateRoleInput): Promise<Result<RoleWithPermissions, DomainError>> {
    const actor = await this.users.findById(input.actorUserId);
    if (!actor) return err(new UserNotFoundError(input.actorUserId));
    if (actor.roleId === input.roleId) return err(new CannotEditOwnRoleError());

    const existing = await this.roles.findById(input.roleId);
    if (!existing) return err(new RoleNotFoundError(input.roleId));

    const name = input.name.trim().toLowerCase();
    const roleWithName = await this.roles.findByName(name);
    if (roleWithName && roleWithName.id !== input.roleId) {
      return err(new RoleNameAlreadyInUseError(name));
    }

    const updated = await this.roles.update(input.roleId, {
      name,
      description: input.description?.trim() || null,
      permissions: [...new Set(input.permissions)],
    });

    return updated ? ok(updated) : err(new RoleNotFoundError(input.roleId));
  }
}
