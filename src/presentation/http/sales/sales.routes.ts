import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuid, uuidParam } from '../shared/common.schemas';
import type { SalesController } from './sales.controller';
import {
  addSaleItemSchema,
  createSaleSchema,
  listSalesQuerySchema,
  registerPaymentSchema,
  registerRefundSchema,
  returnSaleItemSchema,
  salesSummaryQuerySchema,
  updateSaleItemSchema,
  updateSaleSchema,
} from './sales.schemas';

/** Rutas anidadas: la venta y una de sus lineas. */
const saleItemParams = z.object({ id: uuid, itemId: uuid });

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

  /** Archiva (borrado logico) una venta ya cancelada. */
  router.delete(
    '/:id',
    requirePermission('sales:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  // --- Vehiculos de la venta ------------------------------------------------
  //
  // Agregar, corregir y quitar son ediciones del documento: `sales:write`.
  // La DEVOLUCION tambien, porque mueve inventario y altera el importe vigente;
  // no se abre a `payments:write` para que registrar un cobro no habilite de
  // paso a sacar un vehiculo de una venta.

  router.post(
    '/:id/items',
    requirePermission('sales:write'),
    validate({ params: uuidParam(), body: addSaleItemSchema }),
    asyncHandler(controller.addItem),
  );

  router.patch(
    '/:id/items/:itemId',
    requirePermission('sales:write'),
    validate({ params: saleItemParams, body: updateSaleItemSchema }),
    asyncHandler(controller.updateItem),
  );

  /** Quita una linea agregada por error; solo con la venta en proceso. */
  router.delete(
    '/:id/items/:itemId',
    requirePermission('sales:write'),
    validate({ params: saleItemParams }),
    asyncHandler(controller.removeItem),
  );

  /** Devuelve el vehiculo: la linea queda `returned` y la venta sigue viva. */
  router.post(
    '/:id/items/:itemId/return',
    requirePermission('sales:write'),
    validate({ params: saleItemParams, body: returnSaleItemSchema }),
    asyncHandler(controller.returnItem),
  );

  // --- Cobros y reembolsos --------------------------------------------------
  //
  // El estado de cuenta incluye ambos, asi que `GET /payments` los devuelve
  // juntos: separarlos obligaria al frontend a cruzar dos listas para saber
  // cuanto debe el cliente.

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

  /** Devolucion de dinero. Mismo permiso que cobrar: es la misma caja. */
  router.post(
    '/:id/refunds',
    requirePermission('payments:write'),
    validate({ params: uuidParam(), body: registerRefundSchema }),
    asyncHandler(controller.registerRefund),
  );

  return router;
}
