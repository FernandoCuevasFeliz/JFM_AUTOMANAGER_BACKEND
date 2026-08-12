import type { RequestHandler } from 'express';
import type { AsyncLocalAuditContext } from '../../infrastructure/audit/async-local-audit-context';

/**
 * Abre el ambito de auditoria de la peticion.
 *
 * Debe montarse DESPUES de `authMiddleware` para que el actor incluya al
 * usuario; en rutas publicas el actor queda con `userId: null`, que es
 * exactamente lo que `audit_logs.user_id` admite (es NULLABLE).
 */
export function auditContextMiddleware(context: AsyncLocalAuditContext): RequestHandler {
  return (req, _res, next) => {
    context.run(
      {
        userId: req.auth?.userId ?? null,
        // `ip` respeta `trust proxy`; se recorta a los 45 caracteres de la
        // columna (suficiente para IPv6).
        ipAddress: (req.ip ?? null)?.slice(0, 45) ?? null,
      },
      next,
    );
  };
}
