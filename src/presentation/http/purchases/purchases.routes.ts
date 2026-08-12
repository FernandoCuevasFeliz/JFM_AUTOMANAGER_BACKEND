import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { PurchasesController } from './purchases.controller';
import {
  changePurchaseStatusSchema,
  createPurchaseSchema,
  listPurchasesQuerySchema,
  updatePurchaseSchema,
} from './purchases.schemas';

export function buildPurchasesRoutes(controller: PurchasesController): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('purchases:read'),
    validate({ query: listPurchasesQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('purchases:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('purchases:write'),
    validate({ body: createPurchaseSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('purchases:write'),
    validate({ params: uuidParam(), body: updatePurchaseSchema }),
    asyncHandler(controller.update),
  );

  router.patch(
    '/:id/status',
    requirePermission('purchases:write'),
    validate({ params: uuidParam(), body: changePurchaseStatusSchema }),
    asyncHandler(controller.changeStatus),
  );

  router.delete(
    '/:id',
    requirePermission('purchases:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  return router;
}
