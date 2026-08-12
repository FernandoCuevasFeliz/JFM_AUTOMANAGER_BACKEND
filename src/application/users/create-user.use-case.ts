import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { PasswordHasher } from '../../domain/users/password-hasher';
import type { RoleRepository } from '../../domain/users/role.entity';
import { type PublicUser, toPublicUser } from '../../domain/users/user.entity';
import { EmailAlreadyInUseError, RoleNotFoundError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface CreateUserInput {
  readonly roleId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string | null;
  readonly isActive: boolean;
}

export class CreateUserUseCase implements UseCase<CreateUserInput, PublicUser> {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: CreateUserInput): Promise<Result<PublicUser, DomainError>> {
    const email = input.email.trim().toLowerCase();

    const role = await this.roles.findById(input.roleId);
    if (role === null) {
      return err(new RoleNotFoundError(input.roleId));
    }

    if (await this.users.existsByEmail(email)) {
      return err(new EmailAlreadyInUseError(email));
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const user = await this.users.create({
      roleId: input.roleId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      passwordHash,
      phone: input.phone,
      isActive: input.isActive,
    });

    return ok(toPublicUser(user));
  }
}
