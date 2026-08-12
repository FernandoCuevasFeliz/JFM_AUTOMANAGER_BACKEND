import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { SalesController } from './sales.controller';
import {
  createSaleSchema,
  listSalesQuerySchema,
  registerPaymentSchema,
  salesSummaryQuerySchema,
  updateSaleSchema,
} from './sales.schemas';

export function buildSalesRoutes(controller: SalesController): Router {
  const router = Router();

  router.get(
    '/summary',
    requirePermission('reports:read'),
    validate({ query: salesSummaryQuerySchema }),
    asyncHandler(controller.summary),
  );

  router.get(
    '/',
    requirePermission('sales:read'),
    validate({ query: listSalesQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('sales:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('sales:write'),
    validate({ body: createSaleSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('sales:write'),
    validate({ params: uuidParam(), body: updateSaleSchema }),
    asyncHandler(controller.update),
  );

  router.post(
    '/:id/complete',
    requirePermission('sales:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.complete),
  );

  router.post(
    '/:id/cancel',
    requirePermission('sales:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.cancel),
  );

  /**
   * Borrado fisico de una venta cancelada. Libera el UNIQUE de
   * `sales.vehicle_id` para poder revender la unidad; por eso exige el permiso
   * mas fuerte del modulo.
   */
  router.delete(
    '/:id',
    requirePermission('sales:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  // --- Pagos de la venta ---------------------------------------------------

  router.get(
    '/:id/payments',
    requirePermission('payments:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.listPayments),
  );

  router.post(
    '/:id/payments',
    requirePermission('payments:write'),
    validate({ params: uuidParam(), body: registerPaymentSchema }),
    asyncHandler(controller.registerPayment),
  );

  return router;
}
