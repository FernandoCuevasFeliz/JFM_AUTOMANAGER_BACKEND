import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import type { ReportsController } from './reports.controller';
import {
  accountsReceivableQuerySchema,
  fiscalDocumentsQuerySchema,
  monthlyExpensesQuerySchema,
  monthlySalesQuerySchema,
  salesBySalespersonQuerySchema,
  vehicleProfitabilityQuerySchema,
} from './reports.schemas';

/**
 * Reportes. Todo GET: por debajo son vistas, no hay nada que escribir.
 *
 * REGLA DE ACCESO: los agregados piden solo `reports:read` —que tienen los
 * cuatro roles— porque una cifra consolidada del negocio no revela el detalle
 * de nadie. Los dos reportes de DETALLE piden ademas el permiso de lectura del
 * modulo del que sacan la informacion, para que un reporte no sea una puerta
 * lateral a datos que el rol no puede ver por su propio modulo:
 *
 *  - rentabilidad expone el costo de adquisicion y el margen unidad por unidad,
 *    asi que exige `expenses:read` (lo tienen inventario y contabilidad, no
 *    ventas: un vendedor no necesita el margen para vender);
 *  - cuentas por cobrar expone cliente, telefono y saldo, asi que exige
 *    `sales:read` (ventas y contabilidad, que son quienes cobran).
 */
export function buildReportsRoutes(controller: ReportsController): Router {
  const router = Router();

  router.get(
    '/vehicle-profitability',
    requirePermission('reports:read', 'expenses:read'),
    validate({ query: vehicleProfitabilityQuerySchema }),
    asyncHandler(controller.vehicleProfitability),
  );

  router.get(
    '/accounts-receivable',
    requirePermission('reports:read', 'sales:read'),
    validate({ query: accountsReceivableQuerySchema }),
    asyncHandler(controller.accountsReceivable),
  );

  router.get(
    '/sales-monthly',
    requirePermission('reports:read'),
    validate({ query: monthlySalesQuerySchema }),
    asyncHandler(controller.monthlySales),
  );

  router.get(
    '/sales-by-salesperson',
    requirePermission('reports:read'),
    validate({ query: salesBySalespersonQuerySchema }),
    asyncHandler(controller.salesBySalesperson),
  );

  router.get(
    '/expenses-monthly',
    requirePermission('reports:read'),
    validate({ query: monthlyExpensesQuerySchema }),
    asyncHandler(controller.monthlyExpenses),
  );

  router.get(
    '/inventory-status',
    requirePermission('reports:read'),
    asyncHandler(controller.inventoryStatus),
  );

  router.get(
    '/fiscal-documents',
    requirePermission('reports:read'),
    validate({ query: fiscalDocumentsQuerySchema }),
    asyncHandler(controller.fiscalDocuments),
  );

  return router;
}
