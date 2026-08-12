import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { SuppliersController } from './suppliers.controller';
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from './suppliers.schemas';

export function buildSuppliersRoutes(controller: SuppliersController): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('suppliers:read'),
    validate({ query: listSuppliersQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('suppliers:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('suppliers:write'),
    validate({ body: createSupplierSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('suppliers:write'),
    validate({ params: uuidParam(), body: updateSupplierSchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('suppliers:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  return router;
}
