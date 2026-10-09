import { Router } from 'express';
import type { RoleRepository } from '../../../domain/users/role.entity';
import type { TokenService } from '../../../domain/users/token-service';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission, requireRole } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { UsersController } from './users.controller';
import {
  changePasswordSchema,
  createRoleSchema,
  createUserSchema,
  listUsersQuerySchema,
  loginSchema,
  refreshSessionSchema,
  resetPasswordSchema,
  updateUserSchema,
  updateRoleSchema,
} from './users.schemas';

/**
 * Rutas de autenticacion.
 *
 * `POST /auth/login` y `POST /auth/refresh` son los unicos endpoints publicos:
 * el refresco no puede exigir un access token valido, porque su razon de ser es
 * justamente que el access token ya expiro. Lo que lo autoriza es el propio
 * refresh token del cuerpo.
 */
export function buildAuthRoutes(
  controller: UsersController,
  tokens: TokenService,
  roles: RoleRepository,
): Router {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), asyncHandler(controller.login));

  router.post(
    '/refresh',
    validate({ body: refreshSessionSchema }),
    asyncHandler(controller.refresh),
  );

  router.post('/logout', validate({ body: refreshSessionSchema }), asyncHandler(controller.logout));

  router.get('/me', authMiddleware(tokens, roles), asyncHandler(controller.me));

  router.get('/sessions', authMiddleware(tokens, roles), asyncHandler(controller.sessions));

  router.post('/logout-all', authMiddleware(tokens, roles), asyncHandler(controller.logoutAll));

  router.post(
    '/change-password',
    authMiddleware(tokens, roles),
    validate({ body: changePasswordSchema }),
    asyncHandler(controller.changeOwnPassword),
  );

  return router;
}

/** Administracion de usuarios y consulta del catalogo de roles. */
export function buildUsersRoutes(controller: UsersController): Router {
  const router = Router();

  router.get('/roles', requirePermission('users:read'), asyncHandler(controller.roles));

  router.get('/permissions', requirePermission('users:read'), controller.permissions);

  router.post(
    '/roles',
    requirePermission('users:write'),
    validate({ body: createRoleSchema }),
    asyncHandler(controller.createRole),
  );

  router.patch(
    '/roles/:id',
    requirePermission('users:write'),
    validate({ params: uuidParam(), body: updateRoleSchema }),
    asyncHandler(controller.updateRole),
  );

  router.delete(
    '/roles/:id',
    requireRole('admin'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.deleteRole),
  );

  router.get('/sessions', requirePermission('users:read'), asyncHandler(controller.allSessions));

  router.delete(
    '/sessions/:id',
    requirePermission('users:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.revokeSession),
  );

  router.post(
    '/:id/logout-all',
    requirePermission('users:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.revokeUserSessions),
  );

  router.get(
    '/',
    requirePermission('users:read'),
    validate({ query: listUsersQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('users:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('users:write'),
    validate({ body: createUserSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('users:write'),
    validate({ params: uuidParam(), body: updateUserSchema }),
    asyncHandler(controller.update),
  );

  router.post(
    '/:id/reset-password',
    requirePermission('users:write'),
    validate({ params: uuidParam(), body: resetPasswordSchema }),
    asyncHandler(controller.resetPassword),
  );

  router.delete(
    '/:id',
    requirePermission('users:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  return router;
}
