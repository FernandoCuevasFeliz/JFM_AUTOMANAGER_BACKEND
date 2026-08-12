import type { Permission } from './permissions';

/** Contenido del access token que emite el sistema. */
export interface AuthTokenPayload {
  readonly userId: string;
  readonly email: string;
  readonly roleId: string;
  readonly roleName: string;
}

export interface IssuedToken {
  readonly token: string;
  /** Momento de expiracion del token. */
  readonly expiresAt: Date;
}

/** Identidad ya verificada que viaja en `req.auth`. */
export interface AuthenticatedUser extends AuthTokenPayload {
  readonly permissions: readonly Permission[];
}

/**
 * Puerto de emision/verificacion de tokens. Implementado con JWT firmado
 * (HS256) en `infrastructure/auth/jwt-token-service.ts`.
 */
export interface TokenService {
  issue(payload: AuthTokenPayload): IssuedToken;
  /** Devuelve `null` si el token es invalido, esta expirado o fue manipulado. */
  verify(token: string): AuthTokenPayload | null;
}
