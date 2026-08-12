import type { Clock } from '../../domain/shared/clock';
import { type Permission, permissionsForRole } from '../../domain/users/permissions';
import type { RefreshTokenGenerator } from '../../domain/users/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import type { TokenService } from '../../domain/users/token-service';
import { type PublicUser, toPublicUser, type UserWithRole } from '../../domain/users/user.entity';

/** Datos del dispositivo desde el que se abre la sesion. */
export interface SessionContext {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

export interface IssuedSession {
  /** JWT de vida corta que autoriza cada peticion. */
  readonly accessToken: string;
  readonly expiresAt: Date;
  /** Secreto opaco de vida larga; se entrega en claro una unica vez. */
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly user: PublicUser & { readonly roleName: string };
  readonly permissions: readonly Permission[];
}

/**
 * Emite el par access token + refresh token.
 *
 * Lo comparten el login y el refresco para que ambos produzcan exactamente la
 * misma forma de respuesta: si divergieran, el cliente tendria que tratar dos
 * formatos de sesion distintos.
 */
export class SessionIssuer {
  constructor(
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly generator: RefreshTokenGenerator,
    private readonly clock: Clock,
    private readonly refreshTtlDays: number,
  ) {}

  async issue(user: UserWithRole, context: SessionContext): Promise<IssuedSession> {
    const access = this.tokens.issue({
      userId: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.roleName,
    });

    const refreshToken = this.generator.generate();
    const refreshExpiresAt = new Date(
      this.clock.now().getTime() + this.refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokens.create({
      userId: user.id,
      // Solo se guarda el hash: quien lea la tabla no puede suplantar a nadie.
      tokenHash: this.generator.hash(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    return {
      accessToken: access.token,
      expiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
      user: { ...toPublicUser(user), roleName: user.roleName },
      permissions: permissionsForRole(user.roleName),
    };
  }
}
