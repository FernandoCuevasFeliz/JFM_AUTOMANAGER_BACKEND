import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type {
  AuthTokenPayload,
  IssuedToken,
  TokenService,
} from '../../domain/users/token-service';

interface JwtClaims extends JwtPayload {
  readonly email: string;
  readonly roleId: string;
  readonly roleName: string;
}

export interface JwtTokenServiceOptions {
  readonly secret: string;
  readonly expiresIn: string;
  readonly issuer: string;
}

/**
 * Emision y verificacion de access tokens con JWT firmado (HS256).
 *
 * El `sub` del token es el id del usuario. Se incluye el nombre del rol para
 * que el middleware de permisos resuelva el acceso sin consultar la base en
 * cada peticion; el contrapeso es que un cambio de rol no surte efecto hasta
 * que el token expira (por eso la vigencia corta que trae `.env.example`).
 *
 * El sistema NO emite refresh tokens: no existe tabla para almacenarlos en el
 * esquema entregado. Ver la propuesta en el README.
 */
export class JwtTokenService implements TokenService {
  constructor(private readonly options: JwtTokenServiceOptions) {}

  issue(payload: AuthTokenPayload): IssuedToken {
    const signOptions = {
      subject: payload.userId,
      issuer: this.options.issuer,
      expiresIn: this.options.expiresIn,
    } as SignOptions;

    const token = jwt.sign(
      { email: payload.email, roleId: payload.roleId, roleName: payload.roleName },
      this.options.secret,
      signOptions,
    );

    const decoded = jwt.decode(token);
    const expiresAt =
      typeof decoded === 'object' && decoded !== null && typeof decoded.exp === 'number'
        ? new Date(decoded.exp * 1000)
        : new Date();

    return { token, expiresAt };
  }

  verify(token: string): AuthTokenPayload | null {
    try {
      const claims = jwt.verify(token, this.options.secret, {
        issuer: this.options.issuer,
      }) as JwtClaims;

      if (typeof claims.sub !== 'string') {
        return null;
      }

      return {
        userId: claims.sub,
        email: claims.email,
        roleId: claims.roleId,
        roleName: claims.roleName,
      };
    } catch {
      // Token invalido, expirado, con otra firma o con otro emisor.
      return null;
    }
  }
}
