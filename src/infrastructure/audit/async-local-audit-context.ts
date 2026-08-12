import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditActor, AuditContextProvider } from '../../domain/shared/audit';

const EMPTY_ACTOR: AuditActor = { userId: null, ipAddress: null };

/**
 * Contexto de auditoria por peticion, implementado con `AsyncLocalStorage`.
 *
 * Permite que el decorador de auditoria sepa quien ejecuta la operacion sin
 * arrastrar el usuario y la IP como parametros a traves de controlador, caso de
 * uso y repositorio. El middleware `auditContextMiddleware` abre el ambito al
 * inicio de cada peticion y todo lo que ocurra dentro (incluidos los `await`)
 * lo ve.
 */
export class AsyncLocalAuditContext implements AuditContextProvider {
  private readonly storage = new AsyncLocalStorage<AuditActor>();

  /** Ejecuta `work` con el actor indicado disponible para todo el arbol async. */
  run<T>(actor: AuditActor, work: () => T): T {
    return this.storage.run(actor, work);
  }

  getActor(): AuditActor {
    return this.storage.getStore() ?? EMPTY_ACTOR;
  }
}
