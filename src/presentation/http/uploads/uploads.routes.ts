import { Router } from 'express';
import { requirePermission } from '../../middlewares/rbac.middleware';
import type { UploadsController } from './uploads.controller';

export function buildUploadsRoutes(controller: UploadsController): Router {
  const router = Router();

  /**
   * Se exige `vehicles:write` porque hoy las subidas son fotos de unidades:
   * quien no puede editar un vehiculo tampoco necesita firmar una subida. Sin
   * este candado, cualquiera con la URL podria pedir firmas ilimitadas y subir
   * archivos a la cuenta de ImageKit de la empresa.
   */
  router.get('/imagekit-auth', requirePermission('vehicles:write'), controller.imageKitAuth);

  return router;
}
