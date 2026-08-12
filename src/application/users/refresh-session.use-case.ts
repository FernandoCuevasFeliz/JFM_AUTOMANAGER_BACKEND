import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  isRefreshTokenExpired,
  type RefreshTokenGenerator,
} from '../../domain/users/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import { canAuthenticate } from '../../domain/users/user.entity';
import {
  InactiveUserError,
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
} from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { IssuedSession, SessionContext, SessionIssuer } from './issue-session';
import type { UseCase } from '../shared/use-case';

export interface RefreshSessionInput extends SessionContext {
  readonly refreshToken: string;
}

/**
 * Renueva la sesion a partir de un refresh token.
 *
 * Aplica ROTACION: cada refresh token es de un solo uso; al canjearlo se revoca
 * y se emite uno nuevo. Eso acota la ventana de utilidad de un token robado y,
 * sobre todo, hace detectable el robo.
 *
 * DETECCION DE REUTILIZACION: si llega un token que ya estaba revocado, existen
 * dos copias en circulacion (la legitima y una robada) y no hay forma de saber
 * cual es cual. Se revocan todas las sesiones del usuario y se le obliga a
 * iniciar sesion de nuevo: es la unica respuesta segura.
 *
 * La revocacion se hace ANTES de emitir el token nuevo a proposito. Si fallara
 * el paso intermedio, el peor caso es que el usuario tenga que volver a iniciar
 * sesion (fail-closed); al reves, un fallo dejaria vivo un token que deberia
 * estar muerto.
 */
export class RefreshSessionUseCase implements UseCase<RefreshSessionInput, IssuedSession> {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly generator: RefreshTokenGenerator,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(input: RefreshSessionInput): Promise<Result<IssuedSession, DomainError>> {
    const tokenHash = this.generator.hash(input.refreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);

    if (stored === null) {
      return err(new InvalidRefreshTokenError());
    }

    if (stored.revokedAt !== null) {
      await this.refreshTokens.revokeAllForUser(stored.userId);
      return err(new RefreshTokenReuseDetectedError());
    }

    if (isRefreshTokenExpired(stored, this.clock.now())) {
      return err(new InvalidRefreshTokenError());
    }

    const user = await this.users.findByIdWithRole(stored.userId);
    if (user === null) {
      return err(new InvalidRefreshTokenError());
    }

    // Un usuario desactivado despues de iniciar sesion no puede seguir
    // renovandola: es lo que hace efectiva la baja sin esperar al vencimiento.
    if (!canAuthenticate(user)) {
      await this.refreshTokens.revokeAllForUser(user.id);
      return err(new InactiveUserError());
    }

    await this.refreshTokens.revoke(stored.id);

    const session = await this.sessions.issue(user, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    return ok(session);
  }
}
