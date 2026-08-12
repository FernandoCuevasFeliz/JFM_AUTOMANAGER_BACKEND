import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuidParam } from '../shared/common.schemas';
import type { ReservationsController } from './reservations.controller';
import {
  createReservationSchema,
  listReservationsQuerySchema,
  updateReservationSchema,
} from './reservations.schemas';

export function buildReservationsRoutes(controller: ReservationsController): Router {
  const router = Router();

  /** Mantenimiento: vence reservas y libera sus vehiculos. */
  router.post(
    '/expire-overdue',
    requirePermission('reservations:write'),
    asyncHandler(controller.expire),
  );

  router.get(
    '/',
    requirePermission('reservations:read'),
    validate({ query: listReservationsQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('reservations:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('reservations:write'),
    validate({ body: createReservationSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('reservations:write'),
    validate({ params: uuidParam(), body: updateReservationSchema }),
    asyncHandler(controller.update),
  );

  router.post(
    '/:id/cancel',
    requirePermission('reservations:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.cancel),
  );

  return router;
}
