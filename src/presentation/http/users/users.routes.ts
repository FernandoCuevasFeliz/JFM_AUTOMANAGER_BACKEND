import { Router } from 'express';
import type { TokenService } from '../../../domain/users/token-service';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { UsersController } from './users.controller';
import {
  changePasswordSchema,
  createUserSchema,
  listUsersQuerySchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
} from './users.schemas';

/**
 * Rutas de autenticacion. `POST /auth/login` es el unico endpoint publico de
 * la API; todo lo demas exige token.
 */
export function buildAuthRoutes(controller: UsersController, tokens: TokenService): Router {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), asyncHandler(controller.login));

  router.get('/me', authMiddleware(tokens), asyncHandler(controller.me));

  router.post(
    '/change-password',
    authMiddleware(tokens),
    validate({ body: changePasswordSchema }),
    asyncHandler(controller.changeOwnPassword),
  );

  return router;
}

/** Administracion de usuarios y consulta del catalogo de roles. */
export function buildUsersRoutes(controller: UsersController): Router {
  const router = Router();

  router.get('/roles', requirePermission('users:read'), asyncHandler(controller.roles));

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
