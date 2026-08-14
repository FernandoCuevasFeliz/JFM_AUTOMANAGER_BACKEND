import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uuid, uuidParam } from '../shared/common.schemas';
import type { InvoicesController } from './invoices.controller';
import {
  createCreditNoteSchema,
  createInvoiceSchema,
  creditNoteParamsSchema,
  issueCreditNoteSchema,
  issueInvoiceSchema,
  listInvoicesQuerySchema,
  rejectInvoiceSchema,
} from './invoices.schemas';

/**
 * Facturacion electronica (e-CF).
 *
 * `invoices:issue` es un permiso propio, separado de `invoices:write`: crear un
 * borrador de comprobante y declarar que la DGII lo acepto son actos de peso
 * muy distinto, y el segundo fija un NCF que ya no se puede cambiar.
 *
 * No hay DELETE en todo el modulo: un documento fiscal no se borra.
 */
export function buildInvoicesRoutes(controller: InvoicesController): Router {
  const router = Router();

  router.get(
    '/by-sale/:saleId',
    requirePermission('invoices:read'),
    validate({ params: z.object({ saleId: uuid }) }),
    asyncHandler(controller.getBySale),
  );

  router.get(
    '/',
    requirePermission('invoices:read'),
    validate({ query: listInvoicesQuerySchema }),
    asyncHandler(controller.list),
  );

  router.get(
    '/:id',
    requirePermission('invoices:read'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.getById),
  );

  router.post(
    '/',
    requirePermission('invoices:write'),
    validate({ body: createInvoiceSchema }),
    asyncHandler(controller.create),
  );

  router.post(
    '/:id/issue',
    requirePermission('invoices:issue'),
    validate({ params: uuidParam(), body: issueInvoiceSchema }),
    asyncHandler(controller.issue),
  );

  router.post(
    '/:id/reject',
    requirePermission('invoices:issue'),
    validate({ params: uuidParam(), body: rejectInvoiceSchema }),
    asyncHandler(controller.reject),
  );

  router.post(
    '/:id/retry',
    requirePermission('invoices:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.retry),
  );

  router.post(
    '/:id/cancel',
    requirePermission('invoices:write'),
    validate({ params: uuidParam() }),
    asyncHandler(controller.cancel),
  );

  // --- Notas de credito ----------------------------------------------------

  router.post(
    '/:id/credit-notes',
    requirePermission('credit-notes:write'),
    validate({ params: uuidParam(), body: createCreditNoteSchema }),
    asyncHandler(controller.createCreditNoteHandler),
  );

  router.post(
    '/:id/credit-notes/:creditNoteId/issue',
    requirePermission('invoices:issue'),
    validate({ params: creditNoteParamsSchema, body: issueCreditNoteSchema }),
    asyncHandler(controller.issueCreditNoteHandler),
  );

  router.post(
    '/:id/credit-notes/:creditNoteId/reject',
    requirePermission('invoices:issue'),
    validate({ params: creditNoteParamsSchema }),
    asyncHandler(controller.rejectCreditNoteHandler),
  );

  return router;
}
