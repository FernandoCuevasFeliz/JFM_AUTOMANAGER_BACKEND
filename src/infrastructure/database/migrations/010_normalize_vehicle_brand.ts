import { type Kysely, sql } from 'kysely';

/**
 * El modelo ya determina la marca. Eliminar `vehicles.brand_id` evita que una
 * unidad pueda apuntar a una marca distinta de la asociada a su modelo.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP VIEW IF EXISTS vw_vehicle_profitability;
DROP INDEX IF EXISTS idx_vehicles_brand_model;
ALTER TABLE vehicles DROP COLUMN brand_id;
CREATE INDEX idx_vehicles_model ON vehicles(model_id);

${profitabilityViewSql()}
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP VIEW IF EXISTS vw_vehicle_profitability;
DROP INDEX IF EXISTS idx_vehicles_model;

ALTER TABLE vehicles ADD COLUMN brand_id UUID;
UPDATE vehicles v
SET brand_id = m.brand_id
FROM vehicle_models m
WHERE m.id = v.model_id;
ALTER TABLE vehicles ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_brand_id_fkey
  FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id) ON DELETE RESTRICT;
CREATE INDEX idx_vehicles_brand_model ON vehicles(brand_id, model_id);

${profitabilityViewSql()}
`).execute(db);
}

/** La vista usa siempre la relacion normalizada, incluso durante el rollback. */
function profitabilityViewSql(): string {
  return `
CREATE VIEW vw_vehicle_profitability AS
WITH purchase_cost AS (
  SELECT
    pi.vehicle_id,
    btrim(cur.code) AS currency_code,
    p.exchange_rate,
    (pi.unit_cost + pi.freight_cost + pi.insurance_cost + pi.other_costs) AS import_subtotal,
    ROUND(
      (pi.unit_cost + pi.freight_cost + pi.insurance_cost + pi.other_costs) * p.exchange_rate,
      2
    ) AS import_subtotal_converted
  FROM purchase_items pi
  JOIN purchases p    ON p.id = pi.purchase_id AND p.deleted_at IS NULL
  JOIN currencies cur ON cur.id = p.currency_id
),
vehicle_expenses AS (
  SELECT
    e.vehicle_id,
    ROUND(SUM(e.amount * e.exchange_rate), 2) AS expenses_total_converted
  FROM expenses e
  WHERE e.vehicle_id IS NOT NULL
    AND e.deleted_at IS NULL
  GROUP BY e.vehicle_id
),
active_sale AS (
  SELECT
    si.vehicle_id,
    si.id AS sale_item_id,
    si.sale_price,
    s.id AS sale_id,
    s.sale_number,
    s.status AS sale_status,
    s.sale_date,
    s.exchange_rate,
    s.currency_id
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.status = 'active'
    AND s.status <> 'cancelled'
    AND s.deleted_at IS NULL
)
SELECT
  v.id AS vehicle_id,
  v.chassis_number,
  b.name AS brand_name,
  m.name AS model_name,
  v.year,
  v.status,
  v.is_active,
  v.sale_price AS list_price,
  pc.currency_code AS purchase_currency_code,
  pc.exchange_rate AS purchase_exchange_rate,
  COALESCE(pc.import_subtotal, 0) AS import_subtotal,
  COALESCE(pc.import_subtotal_converted, 0) AS import_subtotal_converted,
  COALESCE(ex.expenses_total_converted, 0) AS expenses_total_converted,
  t.total_cost AS total_cost_converted,
  s.sale_id,
  s.sale_item_id,
  s.sale_number,
  s.sale_status,
  s.sale_date,
  btrim(sc.code) AS sale_currency_code,
  s.sale_price AS sold_price,
  t.sold_converted AS sold_price_converted,
  CASE
    WHEN t.sold_converted IS NULL THEN NULL
    ELSE t.sold_converted - t.total_cost
  END AS margin,
  CASE
    WHEN t.sold_converted IS NULL OR t.total_cost = 0 THEN NULL
    ELSE ROUND(((t.sold_converted - t.total_cost) / t.total_cost) * 100, 2)
  END AS margin_percentage
FROM vehicles v
JOIN vehicle_models m ON m.id = v.model_id
JOIN vehicle_brands b ON b.id = m.brand_id
LEFT JOIN purchase_cost pc ON pc.vehicle_id = v.id
LEFT JOIN vehicle_expenses ex ON ex.vehicle_id = v.id
LEFT JOIN active_sale s ON s.vehicle_id = v.id
LEFT JOIN currencies sc ON sc.id = s.currency_id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(pc.import_subtotal_converted, 0)
      + COALESCE(ex.expenses_total_converted, 0) AS total_cost,
    CASE
      WHEN s.sale_id IS NULL THEN NULL
      ELSE ROUND(s.sale_price * s.exchange_rate, 2)
    END AS sold_converted
) t
WHERE v.deleted_at IS NULL;
`;
}
