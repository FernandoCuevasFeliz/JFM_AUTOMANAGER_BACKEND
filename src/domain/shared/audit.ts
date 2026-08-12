/**
 * Puertos de auditoria.
 *
 * La escritura en `audit_logs` es transversal: ningun caso de uso la invoca.
 * Un decorador (`application/shared/with-audit.ts`) envuelve los casos de uso
 * de escritura y usa estos puertos.
 */
export type AuditAction = 'insert' | 'update' | 'delete';

export interface AuditEntry {
  readonly userId: string | null;
  readonly tableName: string;
  readonly recordId: string | null;
  readonly action: AuditAction;
  readonly oldData: Record<string, unknown> | null;
  readonly newData: Record<string, unknown> | null;
  readonly ipAddress: string | null;
}

export interface AuditLogRepository {
  record(entry: AuditEntry): Promise<void>;
}

/**
 * Lee el estado crudo de una fila para poder guardar `old_data` / `new_data`
 * sin que cada modulo tenga que serializar su entidad a mano.
 */
export interface AuditSnapshotReader {
  snapshot(tableName: string, recordId: string): Promise<Record<string, unknown> | null>;
}

/** Quien ejecuta la operacion y desde donde. Lo provee la capa HTTP. */
export interface AuditActor {
  readonly userId: string | null;
  readonly ipAddress: string | null;
}

/**
 * Acceso al actor de la peticion en curso sin pasarlo por parametro a traves
 * de todas las capas. Se implementa con `AsyncLocalStorage`.
 */
export interface AuditContextProvider {
  getActor(): AuditActor;
}
