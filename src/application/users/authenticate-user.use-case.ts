import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { PasswordHasher } from '../../domain/users/password-hasher';
import { type Permission, permissionsForRole } from '../../domain/users/permissions';
import type { TokenService } from '../../domain/users/token-service';
import { canAuthenticate, type PublicUser, toPublicUser } from '../../domain/users/user.entity';
import { InactiveUserError, InvalidCredentialsError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface AuthenticateUserInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticateUserOutput {
  readonly token: string;
  readonly expiresAt: Date;
  readonly user: PublicUser & { readonly roleName: string };
  readonly permissions: readonly Permission[];
}

/**
 * Login por correo y contrasena.
 *
 * Si el correo no existe igualmente se ejecuta una comparacion de bcrypt
 * contra un hash ficticio: sin eso, un correo inexistente responderia
 * notablemente mas rapido que uno existente y permitiria enumerar usuarios
 * midiendo el tiempo de respuesta.
 */
export class AuthenticateUserUseCase
  implements UseCase<AuthenticateUserInput, AuthenticateUserOutput>
{
  /** Hash bcrypt valido de una cadena arbitraria, usado como senuelo. */
  private static readonly DUMMY_HASH =
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.C0kL0hWv6oQKe4c9m7l3q6a1nS3S';

  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AuthenticateUserInput,
  ): Promise<Result<AuthenticateUserOutput, DomainError>> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    if (user === null) {
      await this.passwordHasher.compare(input.password, AuthenticateUserUseCase.DUMMY_HASH);
      return err(new InvalidCredentialsError());
    }

    const passwordMatches = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      return err(new InvalidCredentialsError());
    }

    if (!canAuthenticate(user)) {
      return err(new InactiveUserError());
    }

    const issued = this.tokens.issue({
      userId: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.roleName,
    });

    await this.users.touchLastLogin(user.id, this.clock.now());

    return ok({
      token: issued.token,
      expiresAt: issued.expiresAt,
      user: { ...toPublicUser(user), roleName: user.roleName },
      permissions: permissionsForRole(user.roleName),
    });
  }
}
