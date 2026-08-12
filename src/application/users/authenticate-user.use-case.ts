import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { PasswordHasher } from '../../domain/users/password-hasher';
import { canAuthenticate } from '../../domain/users/user.entity';
import { InactiveUserError, InvalidCredentialsError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { IssuedSession, SessionContext, SessionIssuer } from './issue-session';
import type { UseCase } from '../shared/use-case';

export interface AuthenticateUserInput extends SessionContext {
  readonly email: string;
  readonly password: string;
}

export type AuthenticateUserOutput = IssuedSession;

/**
 * Login por correo y contrasena. Devuelve un access token de vida corta y un
 * refresh token con el que renovarlo sin volver a pedir credenciales.
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
    private readonly sessions: SessionIssuer,
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

    const session = await this.sessions.issue(user, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    await this.users.touchLastLogin(user.id, this.clock.now());

    return ok(session);
  }
}
