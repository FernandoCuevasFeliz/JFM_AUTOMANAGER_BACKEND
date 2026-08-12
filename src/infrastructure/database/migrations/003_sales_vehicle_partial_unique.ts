import { type Kysely, sql } from 'kysely';

/**
 * Sustituye el UNIQUE incondicional de `sales.vehicle_id` por un indice unico
 * PARCIAL que ignora las ventas canceladas y las borradas logicamente.
 *
 * Motivo: con el UNIQUE original, una venta cancelada seguia ocupando el
 * vehiculo y este no podia volver a venderse nunca, salvo borrando fisicamente
 * el registro (y con el, su historial de pagos). El indice parcial conserva la
 * regla de negocio real —"un vehiculo no puede tener dos ventas VIGENTES a la
 * vez"— sin sacrificar la trazabilidad de las operaciones anuladas.
 *
 * Efectos en la aplicacion:
 *  - `cancel-sale` deja el vehiculo realmente disponible para revenderse.
 *  - `delete-sale` vuelve a ser un borrado logico (`deleted_at`), como el resto
 *    del sistema; desaparece el unico borrado fisico que habia.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DO $$
DECLARE
  existing_constraint text;
BEGIN
  -- El nombre lo genero Postgres al crear la tabla (normalmente
  -- 'sales_vehicle_id_key'); se busca en el catalogo para no depender de el.
  SELECT con.conname INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'sales'
    AND con.contype = 'u'
    AND con.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'vehicle_id')
    ];

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', existing_constraint);
  END IF;
END;
$$;

CREATE UNIQUE INDEX uq_sales_vehicle_active
  ON sales(vehicle_id)
  WHERE status <> 'cancelled' AND deleted_at IS NULL;
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP INDEX IF EXISTS uq_sales_vehicle_active;

-- Restaurar el UNIQUE incondicional solo es posible si no quedan vehiculos con
-- mas de una venta registrada (por ejemplo, una cancelada y una vigente).
ALTER TABLE sales ADD CONSTRAINT sales_vehicle_id_key UNIQUE (vehicle_id);
`).execute(db);
}
