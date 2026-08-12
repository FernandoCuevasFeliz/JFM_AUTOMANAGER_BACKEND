import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuid, uuidParam } from '../shared/common.schemas';
import type { ExpensesController } from './expenses.controller';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './expenses.schemas';

export function buildExpensesRoutes(controller: ExpensesController): Router {
  const router = Router();

  router.get(
    '/vehicle-cost/:vehicleId',
    requirePermission('reports:read'),
    validate({ params: z.object({ vehicleId: uuid }) }),
    asyncHandler(controller.vehicleCostSummary),
  );

  router.get(
    '/',
    requirePermission('expenses:read'),
    validate({ query: listExpensesQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('expenses:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('expenses:write'),
    validate({ body: createExpenseSchema }),
    asyncHandler(controller.create),
  );

  router.patch(
    '/:id',
    requirePermission('expenses:write'),
    validate({ params: uuidParam(), body: updateExpenseSchema }),
    asyncHandler(controller.update),
  );

  router.delete(
    '/:id',
    requirePermission('expenses:delete'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.remove),
  );

  return router;
}
