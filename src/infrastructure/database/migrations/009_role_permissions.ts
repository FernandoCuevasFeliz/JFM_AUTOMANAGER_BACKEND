import { type Kysely, sql } from 'kysely';

/** Permisos configurables por rol. Los roles existentes conservan exactamente su acceso actual. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission    VARCHAR(80) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission)
);

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN LATERAL unnest(
  CASE r.name
    WHEN 'admin' THEN ARRAY[
      'users:read','users:write','users:delete','catalogs:read','catalogs:write',
      'vehicles:read','vehicles:write','vehicles:delete','vehicles:change-status',
      'clients:read','clients:write','clients:delete','suppliers:read','suppliers:write','suppliers:delete',
      'purchases:read','purchases:write','purchases:delete','expenses:read','expenses:write','expenses:delete',
      'quotations:read','quotations:write','quotations:delete','reservations:read','reservations:write','reservations:delete',
      'sales:read','sales:write','sales:delete','payments:read','payments:write',
      'invoices:read','invoices:write','invoices:issue','credit-notes:write','audit:read','reports:read'
    ]
    WHEN 'ventas' THEN ARRAY[
      'catalogs:read','vehicles:read','clients:read','clients:write',
      'quotations:read','quotations:write','quotations:delete',
      'reservations:read','reservations:write','reservations:delete',
      'sales:read','sales:write','payments:read','payments:write','invoices:read','reports:read'
    ]
    WHEN 'inventario' THEN ARRAY[
      'catalogs:read','catalogs:write','vehicles:read','vehicles:write','vehicles:delete','vehicles:change-status',
      'suppliers:read','suppliers:write','suppliers:delete','purchases:read','purchases:write','purchases:delete',
      'clients:read','expenses:read','reports:read'
    ]
    WHEN 'contabilidad' THEN ARRAY[
      'catalogs:read','vehicles:read','clients:read','suppliers:read','purchases:read',
      'expenses:read','expenses:write','expenses:delete','quotations:read','reservations:read',
      'sales:read','payments:read','payments:write','invoices:read','invoices:write',
      'invoices:issue','credit-notes:write','reports:read'
    ]
    ELSE ARRAY[]::text[]
  END
) AS p(permission)
ON CONFLICT DO NOTHING;
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw('DROP TABLE IF EXISTS role_permissions;').execute(db);
}
