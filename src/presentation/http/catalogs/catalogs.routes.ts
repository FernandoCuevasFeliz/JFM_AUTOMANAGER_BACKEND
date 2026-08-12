import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import type { CatalogsController } from './catalogs.controller';
import { createExpenseCategorySchema, listCatalogsQuerySchema } from './catalogs.schemas';

/**
 * Catalogos maestros. Solo lectura salvo las categorias de gasto: monedas,
 * tipos de documento y metodos de pago se administran por migracion porque el
 * codigo y los reportes dependen de sus valores.
 */
export function buildCatalogsRoutes(controller: CatalogsController): Router {
  const router = Router();

  router.get(
    '/',
    requirePermission('catalogs:read'),
    validate({ query: listCatalogsQuerySchema }),
    asyncHandler(controller.list),
  );

  router.post(
    '/expense-categories',
    requirePermission('catalogs:write'),
    validate({ body: createExpenseCategorySchema }),
    asyncHandler(controller.createExpenseCategoryHandler),
  );

  return router;
}
