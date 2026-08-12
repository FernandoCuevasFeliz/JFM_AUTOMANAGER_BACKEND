import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../domain/shared/domain-error';
import type { Permission } from '../../domain/users/permissions';

/**
 * Exige que el rol del usuario tenga TODOS los permisos indicados.
 *
 * Los permisos salen del mapa `ROLE_PERMISSIONS` (dominio), no de la base:
 * este middleware solo lo consulta a traves de `req.auth.permissions`, que
 * `authMiddleware` ya resolvio.
 */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (req.auth === undefined) {
      next(new UnauthorizedError());
      return;
    }

    const granted = req.auth.permissions;
    const missing = permissions.filter((permission) => !granted.includes(permission));

    if (missing.length > 0) {
      next(
        new ForbiddenError(
          `El rol "${req.auth.roleName}" no tiene permiso para esta accion`,
          { required: permissions, missing },
        ),
      );
      return;
    }

    next();
  };
}

/** Variante que basta con UNO de los permisos indicados. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (req.auth === undefined) {
      next(new UnauthorizedError());
      return;
    }

    const granted = req.auth.permissions;
    if (!permissions.some((permission) => granted.includes(permission))) {
      next(
        new ForbiddenError(`El rol "${req.auth.roleName}" no tiene permiso para esta accion`, {
          requiredAnyOf: permissions,
        }),
      );
      return;
    }

    next();
  };
}

/**
 * Exige pertenecer a alguno de los roles indicados.
 *
 * Se prefiere `requirePermission` en las rutas: nombrar la capacidad envejece
 * mejor que nombrar el rol. `requireRole` queda para lo que es intrinsecamente
 * de un rol (administracion de usuarios).
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (req.auth === undefined) {
      next(new UnauthorizedError());
      return;
    }

    if (!roles.includes(req.auth.roleName)) {
      next(
        new ForbiddenError('Su rol no tiene acceso a este recurso', {
          required: roles,
          current: req.auth.roleName,
        }),
      );
      return;
    }

    next();
  };
}
