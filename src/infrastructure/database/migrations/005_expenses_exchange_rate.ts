import { type Kysely, sql } from 'kysely';

/**
 * Agrega `exchange_rate` a `expenses`.
 *
 * ATENCION: esta columna NO estaba en el esquema entregado ni figuraba entre
 * las propuestas del README. Es una adicion necesaria para poder implementar la
 * tercera decision aprobada (conversion a una moneda unica de reporte).
 *
 * Razon: el costo real de un vehiculo suma tres origenes y solo dos traen su
 * tasa. `purchases.exchange_rate` y `sales.exchange_rate` ya existen, pero
 * `expenses` guarda `currency_id` sin tasa, de modo que un gasto en USD no se
 * puede convertir a pesos sin inventar un valor. Sin esta columna, el "costo
 * total" seria una suma de montos en monedas distintas, que no significa nada.
 *
 * La forma es identica a la de `purchases` y `sales` (`NUMERIC(10,4)`, NOT NULL,
 * DEFAULT 1), asi que las filas ya existentes —registradas en pesos— quedan
 * correctas sin tocarlas: tasa 1 sobre la moneda del gasto.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
ALTER TABLE expenses
  ADD COLUMN exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1;

ALTER TABLE expenses
  ADD CONSTRAINT chk_expenses_exchange_rate_positive CHECK (exchange_rate > 0);
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_exchange_rate_positive;
ALTER TABLE expenses DROP COLUMN IF EXISTS exchange_rate;
`).execute(db);
}
