import { type Kysely, sql } from 'kysely';

/**
 * Semilla de catalogos base (seccion 9 de `schema_ejgh_autoimport.sql`).
 *
 * Se ejecuta como migracion y no como script opcional porque el resto del
 * sistema depende de estos valores: sin monedas, tipos de documento, metodos
 * de pago y roles no se puede registrar ni un cliente. `ON CONFLICT DO NOTHING`
 * la hace idempotente frente a bases que ya tengan los catalogos cargados.
 *
 * Las categorias de gasto no venian en el script original; se incluye un juego
 * minimo alineado al `expense_scope_enum` para que el modulo de gastos sea
 * usable de entrada. Se pueden editar o desactivar desde el catalogo.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
INSERT INTO currencies (code, name, symbol) VALUES
  ('DOP', 'Peso Dominicano', 'RD$'),
  ('USD', 'Dolar Estadounidense', 'US$')
ON CONFLICT (code) DO NOTHING;

INSERT INTO document_types (name) VALUES
  ('Cedula'), ('RNC'), ('Pasaporte')
ON CONFLICT (name) DO NOTHING;

INSERT INTO payment_methods (name) VALUES
  ('Efectivo'), ('Transferencia'), ('Cheque'), ('Tarjeta'), ('Financiamiento')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (name, description) VALUES
  ('admin', 'Acceso total al sistema'),
  ('ventas', 'Gestion de cotizaciones, reservas y ventas'),
  ('inventario', 'Gestion de vehiculos y compras'),
  ('contabilidad', 'Gestion de gastos y pagos')
ON CONFLICT (name) DO NOTHING;

INSERT INTO expense_categories (name, scope) VALUES
  ('Nacionalizacion / Aduana', 'vehicle'),
  ('Transporte interno', 'vehicle'),
  ('Reparacion y mecanica', 'vehicle'),
  ('Preparacion y detailing', 'vehicle'),
  ('Matriculacion y placas', 'vehicle'),
  ('Alquiler de local', 'general'),
  ('Servicios (luz, agua, internet)', 'general'),
  ('Nomina', 'general'),
  ('Publicidad y mercadeo', 'general'),
  ('Gastos administrativos', 'general')
ON CONFLICT (name) DO NOTHING;
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DELETE FROM expense_categories WHERE name IN (
  'Nacionalizacion / Aduana', 'Transporte interno', 'Reparacion y mecanica',
  'Preparacion y detailing', 'Matriculacion y placas', 'Alquiler de local',
  'Servicios (luz, agua, internet)', 'Nomina', 'Publicidad y mercadeo',
  'Gastos administrativos'
);
DELETE FROM roles WHERE name IN ('admin', 'ventas', 'inventario', 'contabilidad');
DELETE FROM payment_methods WHERE name IN ('Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Financiamiento');
DELETE FROM document_types WHERE name IN ('Cedula', 'RNC', 'Pasaporte');
DELETE FROM currencies WHERE code IN ('DOP', 'USD');
`).execute(db);
}
