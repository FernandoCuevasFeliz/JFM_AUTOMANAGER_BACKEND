import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { RoleRepository } from '../../domain/users/role.entity';
import type { UserRepository } from '../../domain/users/user.repository';
import {
  CannotDeleteOwnRoleError,
  RoleHasAssignedUsersError,
  RoleNotFoundError,
  UserNotFoundError,
} from '../../domain/users/user.errors';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface DeleteRoleInput extends ActorInput {
  readonly roleId: string;
}

export class DeleteRoleUseCase implements UseCase<DeleteRoleInput, void> {
  constructor(
    private readonly roles: RoleRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(input: DeleteRoleInput): Promise<Result<void, DomainError>> {
    const actor = await this.users.findById(input.actorUserId);
    if (!actor) return err(new UserNotFoundError(input.actorUserId));
    if (actor.roleId === input.roleId) return err(new CannotDeleteOwnRoleError());

    if (!(await this.roles.findById(input.roleId))) {
      return err(new RoleNotFoundError(input.roleId));
    }

    const assignedUsers = await this.roles.countAssignedUsers(input.roleId);
    if (assignedUsers > 0) {
      return err(new RoleHasAssignedUsersError(input.roleId, assignedUsers));
    }

    return (await this.roles.delete(input.roleId))
      ? okVoid()
      : err(new RoleNotFoundError(input.roleId));
  }
}
