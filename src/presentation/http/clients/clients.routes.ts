import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { ClientsController } from './clients.controller';
import {
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './clients.schemas';

export function buildClientsRoutes(controller: ClientsController): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('clients:read'),
    validate({ query: listClientsQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('clients:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('clients:write'),
    validate({ body: createClientSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('clients:write'),
    validate({ params: uuidParam(), body: updateClientSchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('clients:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  return router;
}
