import { type Kysely, sql } from 'kysely';

/** Retira la capa fiscal; ventas, pagos, reembolsos y comprobantes internos permanecen. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP VIEW IF EXISTS vw_fiscal_documents_summary;
DROP TABLE IF EXISTS credit_notes;
DROP TABLE IF EXISTS invoices;

DELETE FROM role_permissions
WHERE permission IN (
  'invoices:read',
  'invoices:write',
  'invoices:issue',
  'credit-notes:write'
);

DROP TYPE IF EXISTS fiscal_doc_status_enum;
DROP TYPE IF EXISTS ncf_type_enum;
`).execute(db);
}

/** Los documentos fiscales eliminados no pueden reconstruirse mediante rollback. */
export async function down(): Promise<void> {
  throw new Error('La migracion 011_remove_fiscal_billing es irreversible');
}
