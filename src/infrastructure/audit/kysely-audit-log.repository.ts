import { sql } from 'kysely';
import type {
  AuditEntry,
  AuditLogRepository,
  AuditSnapshotReader,
} from '../../domain/shared/audit';
import type { Executor } from '../database/connection';

/**
 * Tablas que se pueden auditar.
 *
 * El nombre de la tabla se interpola directamente en el SQL del snapshot, asi
 * que la lista blanca no es opcional: es lo que impide que un identificador
 * arbitrario llegue a la consulta.
 */
const AUDITABLE_TABLES = new Set<string>([
  'users',
  'clients',
  'suppliers',
  'vehicles',
  'vehicle_images',
  'vehicle_brands',
  'vehicle_models',
  'purchases',
  'purchase_items',
  'expenses',
  'expense_categories',
  'quotations',
  'reservations',
  'sales',
  'sale_payments',
]);

export class KyselyAuditLogRepository implements AuditLogRepository, AuditSnapshotReader {
  constructor(private readonly db: Executor) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db
      .insertInto('audit_logs')
      .values({
        user_id: entry.userId,
        table_name: entry.tableName,
        record_id: entry.recordId,
        action: entry.action,
        old_data: entry.oldData === null ? null : JSON.stringify(entry.oldData),
        new_data: entry.newData === null ? null : JSON.stringify(entry.newData),
        ip_address: entry.ipAddress,
      })
      .execute();
  }

  async snapshot(tableName: string, recordId: string): Promise<Record<string, unknown> | null> {
    if (!AUDITABLE_TABLES.has(tableName)) {
      return null;
    }

    const result = await sql<Record<string, unknown>>`
      select * from ${sql.table(tableName)} where id = ${recordId}
    `.execute(this.db);

    const row = result.rows[0];
    return row === undefined ? null : sanitize(row);
  }
}

/**
 * Nunca se guarda el hash de la contrasena en el registro de auditoria: seria
 * exponerlo a cualquiera con permiso de lectura sobre `audit_logs`.
 */
function sanitize(row: Record<string, unknown>): Record<string, unknown> {
  if (!('password_hash' in row)) {
    return row;
  }
  const { password_hash: _passwordHash, ...rest } = row;
  return rest;
}
