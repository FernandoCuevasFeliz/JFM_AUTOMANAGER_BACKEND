import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { VehiclesController } from './vehicles.controller';
import {
  addVehicleImageSchema,
  catalogQuerySchema,
  changeVehicleStatusSchema,
  createBrandSchema,
  createModelSchema,
  createVehicleSchema,
  imageParamsSchema,
  listVehiclesQuerySchema,
  updateBrandSchema,
  updateModelSchema,
  updateVehicleSchema,
} from './vehicles.schemas';

/**
 * Catalogo de marcas y modelos. Se monta en `/vehicle-brands` y
 * `/vehicle-models`, antes que `/vehicles/:id`, para que `:id` no se coma
 * rutas literales.
 */
export function buildVehicleBrandRoutes(controller: VehiclesController): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('catalogs:read'),
    validate({ query: catalogQuerySchema }),
    asyncHandler(controller.brands),
  );

  router.post(
    '/',
    requirePermission('catalogs:write'),
    validate({ body: createBrandSchema }),
    asyncHandler(controller.createBrandHandler),
  );

  router.patch(
    '/:id',
    requirePermission('catalogs:write'),
    validate({ params: uuidParam(), body: updateBrandSchema }),
    asyncHandler(controller.updateBrandHandler),
  );

  return router;
}

export function buildVehicleModelRoutes(controller: VehiclesController): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('catalogs:read'),
    validate({ query: catalogQuerySchema }),
    asyncHandler(controller.models),
  );

  router.post(
    '/',
    requirePermission('catalogs:write'),
    validate({ body: createModelSchema }),
    asyncHandler(controller.createModelHandler),
  );

  router.patch(
    '/:id',
    requirePermission('catalogs:write'),
    validate({ params: uuidParam(), body: updateModelSchema }),
    asyncHandler(controller.updateModelHandler),
  );

  return router;
}

export function buildVehiclesRoutes(controller: VehiclesController): Router {
  const router = Router();

  router.get(
    '/summary',
    requirePermission('vehicles:read'),
    asyncHandler(controller.inventorySummary),
  );

  router.get(
    '/',
    requirePermission('vehicles:read'),
    validate({ query: listVehiclesQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('vehicles:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('vehicles:write'),
    validate({ body: createVehicleSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('vehicles:write'),
    validate({ params: uuidParam(), body: updateVehicleSchema }),
    asyncHandler(controller.update),
  );

  router.patch(
    '/:id/status',
    requirePermission('vehicles:change-status'),
    validate({ params: uuidParam(), body: changeVehicleStatusSchema }),
    asyncHandler(controller.changeStatus),
  );

  router.delete(
    '/:id',
    requirePermission('vehicles:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  // --- Imagenes del vehiculo ----------------------------------------------

  router.get(
    '/:id/images',
    requirePermission('vehicles:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.listImages),
  );

  router.post(
    '/:id/images',
    requirePermission('vehicles:write'),
    validate({ params: uuidParam(), body: addVehicleImageSchema }),
    asyncHandler(controller.addImage),
  );

  router.patch(
    '/:id/images/:imageId/primary',
    requirePermission('vehicles:write'),
    validate({ params: imageParamsSchema }),
    asyncHandler(controller.setPrimaryImage),
  );

  router.delete(
    '/:id/images/:imageId',
    requirePermission('vehicles:write'),
    validate({ params: imageParamsSchema }),
    asyncHandler(controller.removeImage),
  );

  return router;
}
