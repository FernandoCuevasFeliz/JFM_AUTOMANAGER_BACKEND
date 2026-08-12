import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { RoleRepository } from '../../domain/users/role.entity';
import { type PublicUser, toPublicUser } from '../../domain/users/user.entity';
import {
  EmailAlreadyInUseError,
  RoleNotFoundError,
  UserNotFoundError,
} from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdateUserInput {
  readonly userId: string;
  readonly roleId?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly phone?: string | null;
  readonly isActive?: boolean;
}

export class UpdateUserUseCase implements UseCase<UpdateUserInput, PublicUser> {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async execute(input: UpdateUserInput): Promise<Result<PublicUser, DomainError>> {
    const existing = await this.users.findById(input.userId);
    if (existing === null) {
      return err(new UserNotFoundError(input.userId));
    }

    if (input.roleId !== undefined && (await this.roles.findById(input.roleId)) === null) {
      return err(new RoleNotFoundError(input.roleId));
    }

    const email = input.email?.trim().toLowerCase();
    if (email !== undefined && (await this.users.existsByEmail(email, input.userId))) {
      return err(new EmailAlreadyInUseError(email));
    }

    const updated = await this.users.update(input.userId, {
      ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (updated === null) {
      return err(new UserNotFoundError(input.userId));
    }

    return ok(toPublicUser(updated));
  }
}
