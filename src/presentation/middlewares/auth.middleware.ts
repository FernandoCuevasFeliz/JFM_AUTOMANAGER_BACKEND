import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../../domain/shared/domain-error';
import { permissionsForRole } from '../../domain/users/permissions';
import type { TokenService } from '../../domain/users/token-service';

/**
 * Autenticacion por `Authorization: Bearer <token>`.
 *
 * Verifica la firma del JWT y deja en `req.auth` la identidad junto con los
 * permisos que el mapa `ROLE_PERMISSIONS` concede a su rol. No consulta la
 * base de datos: el token es autocontenido.
 */
export function authMiddleware(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');

    if (header === undefined || !header.toLowerCase().startsWith('bearer ')) {
      next(new UnauthorizedError('Falta el token de autenticacion'));
      return;
    }

    const token = header.slice('bearer '.length).trim();
    const payload = tokens.verify(token);

    if (payload === null) {
      next(new UnauthorizedError('El token es invalido o expiro'));
      return;
    }

    req.auth = { ...payload, permissions: permissionsForRole(payload.roleName) };
    next();
  };
}

/**
 * Id del usuario autenticado. Solo se usa en handlers montados detras de
 * `authMiddleware`, donde `req.auth` siempre esta definido; si no lo estuviera
 * seria un error de montaje de rutas y no una condicion de negocio.
 */
export function requireActorId(req: { auth?: { userId: string } }): string {
  if (req.auth === undefined) {
    throw new Error(
      'Ruta protegida montada sin authMiddleware: no hay usuario autenticado en la peticion',
    );
  }
  return req.auth.userId;
}
