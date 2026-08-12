import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { QuotationsController } from './quotations.controller';
import {
  changeQuotationStatusSchema,
  createQuotationSchema,
  listQuotationsQuerySchema,
  updateQuotationSchema,
} from './quotations.schemas';

export function buildQuotationsRoutes(controller: QuotationsController): Router {
  const router = Router();

  /** Mantenimiento: vence las cotizaciones cuyo plazo ya paso. */
  router.post(
    '/expire-overdue',
    requirePermission('quotations:write'),
    asyncHandler(controller.expire),
  );

  router.get(
    '/',
    requirePermission('quotations:read'),
    validate({ query: listQuotationsQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('quotations:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('quotations:write'),
    validate({ body: createQuotationSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('quotations:write'),
    validate({ params: uuidParam(), body: updateQuotationSchema }),
    asyncHandler(controller.update),
  );

  router.patch(
    '/:id/status',
    requirePermission('quotations:write'),
    validate({ params: uuidParam(), body: changeQuotationStatusSchema }),
    asyncHandler(controller.changeStatus),
  );

  router.delete(
    '/:id',
    requirePermission('quotations:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  return router;
}
