import { Router } from 'express';
import { authMiddleware } from '../presentation/middlewares/auth.middleware';
import { auditContextMiddleware } from '../presentation/middlewares/audit-context.middleware';
import { buildCatalogsRoutes } from '../presentation/http/catalogs/catalogs.routes';
import { buildClientsRoutes } from '../presentation/http/clients/clients.routes';
import { buildExpensesRoutes } from '../presentation/http/expenses/expenses.routes';
import { buildPurchasesRoutes } from '../presentation/http/purchases/purchases.routes';
import { buildQuotationsRoutes } from '../presentation/http/quotations/quotations.routes';
import { buildReservationsRoutes } from '../presentation/http/reservations/reservations.routes';
import { buildSalesRoutes } from '../presentation/http/sales/sales.routes';
import { buildSuppliersRoutes } from '../presentation/http/suppliers/suppliers.routes';
import { buildUploadsRoutes } from '../presentation/http/uploads/uploads.routes';
import { buildAuthRoutes, buildUsersRoutes } from '../presentation/http/users/users.routes';
import {
  buildVehicleBrandRoutes,
  buildVehicleModelRoutes,
  buildVehiclesRoutes,
} from '../presentation/http/vehicles/vehicles.routes';
import type { Container } from './container';

/**
 * Mapa de la API. Todo cuelga de `/api/v1`.
 *
 * `/auth` maneja su propia autenticacion (el login es publico); el resto del
 * arbol pasa primero por `authMiddleware` y luego por el contexto de
 * auditoria, de modo que toda escritura queda asociada a un usuario.
 */
export function buildRouter(container: Container): Router {
  const router = Router();
  const { controllers, tokens, auditContext } = container;

  router.use('/auth', auditContextMiddleware(auditContext), buildAuthRoutes(controllers.users, tokens));

  const protectedRoutes = Router();
  protectedRoutes.use(authMiddleware(tokens));
  protectedRoutes.use(auditContextMiddleware(auditContext));

  protectedRoutes.use('/users', buildUsersRoutes(controllers.users));
  protectedRoutes.use('/catalogs', buildCatalogsRoutes(controllers.catalogs));
  protectedRoutes.use('/vehicle-brands', buildVehicleBrandRoutes(controllers.vehicles));
  protectedRoutes.use('/vehicle-models', buildVehicleModelRoutes(controllers.vehicles));
  protectedRoutes.use('/vehicles', buildVehiclesRoutes(controllers.vehicles));
  protectedRoutes.use('/clients', buildClientsRoutes(controllers.clients));
  protectedRoutes.use('/suppliers', buildSuppliersRoutes(controllers.suppliers));
  protectedRoutes.use('/purchases', buildPurchasesRoutes(controllers.purchases));
  protectedRoutes.use('/expenses', buildExpensesRoutes(controllers.expenses));
  protectedRoutes.use('/quotations', buildQuotationsRoutes(controllers.quotations));
  protectedRoutes.use('/reservations', buildReservationsRoutes(controllers.reservations));
  protectedRoutes.use('/sales', buildSalesRoutes(controllers.sales));
  protectedRoutes.use('/uploads', buildUploadsRoutes(controllers.uploads));

  router.use(protectedRoutes);

  return router;
}
