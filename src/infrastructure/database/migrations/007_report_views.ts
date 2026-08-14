import { type Kysely, sql } from 'kysely';

/**
 * Vistas de reporte (solo lectura).
 *
 * No agregan tablas ni columnas: son consultas con nombre sobre el esquema que
 * ya existe, asi que la 3FN queda intacta y no hay dato duplicado que pueda
 * quedar desincronizado. El costo de mantenerlas es cero.
 *
 * Tres criterios comunes a todas:
 *
 *  - BORRADO LOGICO: toda vista filtra `deleted_at IS NULL`. Un registro
 *    archivado no debe aparecer en un reporte.
 *  - MONEDA: los importes se exponen dos veces, en la moneda del documento y
 *    convertidos a la moneda de reporte (`*_converted`) con la tasa registrada
 *    EN CADA DOCUMENTO, que es el criterio de `domain/shared/money.ts`. Solo la
 *    columna convertida es sumable entre monedas distintas.
 *  - `currencies.code` es CHAR(3) y viene con relleno; las vistas lo devuelven
 *    ya normalizado con `btrim` para que se pueda consumir directo.
 *
 * Si alguna se vuelve lenta con el volumen, se convierte puntualmente a
 * MATERIALIZED VIEW con refresco programado sin tocar el resto del esquema. La
 * unica que cambiaria de semantica al materializarse es
 * `vw_accounts_receivable`, porque su antiguedad se calcula contra
 * `CURRENT_DATE` (quedaria congelada en la fecha del ultimo refresco).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
-- ---------------------------------------------------------------------------
-- Rentabilidad por vehiculo: costo real (compra + gastos) vs precio de venta
-- ---------------------------------------------------------------------------
-- El costo real cruza tres origenes y cada uno trae su propia tasa:
--   purchase_items -> lo que costo traer la unidad (compra, flete, seguro, otros)
--   expenses       -> todo lo gastado en ella despues (taller, placas, etc.)
--   sales          -> a cuanto se vendio, si ya se vendio
-- Un vehiculo sin compra ni gastos ni venta igual aparece, con ceros y NULL:
-- el inventario completo es parte del reporte.
CREATE VIEW vw_vehicle_profitability AS
WITH purchase_cost AS (
  -- purchase_items.vehicle_id es UNIQUE: a lo sumo una fila por vehiculo.
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
  JOIN purchases p   ON p.id = pi.purchase_id AND p.deleted_at IS NULL
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
  -- Una venta cancelada no consumio la unidad: el vehiculo vuelve a estar sin
  -- vender a efectos de margen.
  SELECT s.*
  FROM sales s
  WHERE s.status <> 'cancelled'
    AND s.deleted_at IS NULL
)
SELECT
  v.id                        AS vehicle_id,
  v.chassis_number,
  b.name                      AS brand_name,
  m.name                      AS model_name,
  v.year,
  v.status,
  v.is_active,
  v.sale_price                AS list_price,
  pc.currency_code            AS purchase_currency_code,
  pc.exchange_rate            AS purchase_exchange_rate,
  COALESCE(pc.import_subtotal, 0)            AS import_subtotal,
  COALESCE(pc.import_subtotal_converted, 0)  AS import_subtotal_converted,
  COALESCE(ex.expenses_total_converted, 0)   AS expenses_total_converted,
  t.total_cost                AS total_cost_converted,
  s.id                        AS sale_id,
  s.sale_number,
  s.status                    AS sale_status,
  s.sale_date,
  btrim(sc.code)              AS sale_currency_code,
  s.sale_price                AS sold_price,
  t.sold_converted            AS sold_price_converted,
  CASE
    WHEN t.sold_converted IS NULL THEN NULL
    ELSE t.sold_converted - t.total_cost
  END                         AS margin,
  CASE
    WHEN t.sold_converted IS NULL OR t.total_cost = 0 THEN NULL
    ELSE ROUND(((t.sold_converted - t.total_cost) / t.total_cost) * 100, 2)
  END                         AS margin_percentage
FROM vehicles v
JOIN vehicle_brands b  ON b.id = v.brand_id
JOIN vehicle_models m  ON m.id = v.model_id
LEFT JOIN purchase_cost pc     ON pc.vehicle_id = v.id
LEFT JOIN vehicle_expenses ex  ON ex.vehicle_id = v.id
LEFT JOIN active_sale s        ON s.vehicle_id = v.id
LEFT JOIN currencies sc        ON sc.id = s.currency_id
-- Devuelve siempre exactamente una fila: solo nombra subexpresiones para no
-- repetir la suma del costo en cuatro columnas distintas.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(pc.import_subtotal_converted, 0)
      + COALESCE(ex.expenses_total_converted, 0) AS total_cost,
    CASE
      WHEN s.id IS NULL THEN NULL
      ELSE ROUND(s.sale_price * s.exchange_rate, 2)
    END AS sold_converted
) t
WHERE v.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Cuentas por cobrar: saldo pendiente por venta
-- ---------------------------------------------------------------------------
-- El abono se registra SIEMPRE en la moneda de la venta (lo garantiza
-- "register-sale-payment"), asi que "sale_price - pagos" es una resta entre
-- importes de la misma moneda y la tasa de la venta convierte el saldo.
-- Las ventas canceladas quedan fuera: no generan derecho de cobro.
CREATE VIEW vw_accounts_receivable AS
SELECT
  s.id                          AS sale_id,
  s.sale_number,
  s.sale_date,
  s.status                      AS sale_status,
  s.client_id,
  COALESCE(c.company_name, c.first_name || ' ' || c.last_name) AS client_name,
  c.phone                       AS client_phone,
  s.vehicle_id,
  v.chassis_number,
  s.salesperson_id,
  u.first_name || ' ' || u.last_name AS salesperson_name,
  btrim(cur.code)               AS currency_code,
  s.exchange_rate,
  s.sale_price,
  t.total_paid,
  t.pending_balance,
  ROUND(t.pending_balance * s.exchange_rate, 2) AS pending_balance_converted,
  (CURRENT_DATE - s.sale_date)::int AS days_outstanding
FROM sales s
JOIN clients c     ON c.id = s.client_id
JOIN vehicles v    ON v.id = s.vehicle_id
JOIN users u       ON u.id = s.salesperson_id
JOIN currencies cur ON cur.id = s.currency_id
LEFT JOIN (
  SELECT sale_id, SUM(amount) AS total_paid
  FROM sale_payments
  GROUP BY sale_id
) pay ON pay.sale_id = s.id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(pay.total_paid, 0) AS total_paid,
    -- GREATEST evita un saldo negativo si alguna vez se cobrara de mas.
    GREATEST(s.sale_price - COALESCE(pay.total_paid, 0), 0) AS pending_balance
) t
WHERE s.status <> 'cancelled'
  AND s.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Ventas completadas por mes y moneda
-- ---------------------------------------------------------------------------
-- Solo 'completed': una venta en proceso todavia puede caerse y no es ingreso
-- reconocido. El mes se expone como DATE (dia 1) para que ordene y filtre como
-- fecha, no como texto.
CREATE VIEW vw_sales_summary_monthly AS
SELECT
  date_trunc('month', s.sale_date)::date AS month,
  btrim(cur.code)                        AS currency_code,
  COUNT(*)::int                          AS sales_count,
  SUM(s.sale_price)                      AS total_amount,
  ROUND(SUM(s.sale_price * s.exchange_rate), 2) AS total_amount_converted
FROM sales s
JOIN currencies cur ON cur.id = s.currency_id
WHERE s.status = 'completed'
  AND s.deleted_at IS NULL
GROUP BY 1, 2;

-- ---------------------------------------------------------------------------
-- Desempeno por vendedor: ventas completadas por vendedor, mes y moneda
-- ---------------------------------------------------------------------------
CREATE VIEW vw_sales_by_salesperson AS
SELECT
  date_trunc('month', s.sale_date)::date AS month,
  s.salesperson_id,
  u.first_name || ' ' || u.last_name     AS salesperson_name,
  btrim(cur.code)                        AS currency_code,
  COUNT(*)::int                          AS sales_count,
  SUM(s.sale_price)                      AS total_amount,
  ROUND(SUM(s.sale_price * s.exchange_rate), 2) AS total_amount_converted
FROM sales s
JOIN users u        ON u.id = s.salesperson_id
JOIN currencies cur ON cur.id = s.currency_id
WHERE s.status = 'completed'
  AND s.deleted_at IS NULL
GROUP BY 1, 2, 3, 4;

-- ---------------------------------------------------------------------------
-- Gastos por mes, categoria, alcance y moneda
-- ---------------------------------------------------------------------------
-- El alcance se deriva del gasto (tiene vehiculo o no), no del "scope" de la
-- categoria: la categoria declara donde DEBERIA usarse, el gasto dice donde se
-- uso, y el reporte tiene que contar los hechos.
CREATE VIEW vw_expenses_summary_monthly AS
SELECT
  date_trunc('month', e.expense_date)::date AS month,
  e.category_id,
  ec.name                                   AS category_name,
  (CASE WHEN e.vehicle_id IS NULL THEN 'general' ELSE 'vehicle' END)::expense_scope_enum AS scope,
  btrim(cur.code)                           AS currency_code,
  COUNT(*)::int                             AS expense_count,
  SUM(e.amount)                             AS total_amount,
  ROUND(SUM(e.amount * e.exchange_rate), 2) AS total_amount_converted
FROM expenses e
JOIN expense_categories ec ON ec.id = e.category_id
JOIN currencies cur        ON cur.id = e.currency_id
WHERE e.deleted_at IS NULL
GROUP BY 1, 2, 3, 4, 5;

-- ---------------------------------------------------------------------------
-- Inventario: conteo de vehiculos activos por estado
-- ---------------------------------------------------------------------------
-- Recorre los valores del ENUM en lugar de agrupar la tabla, para que un estado
-- sin unidades devuelva 0 y no desaparezca de la fila del tablero.
CREATE VIEW vw_inventory_status_summary AS
SELECT
  st.status,
  COUNT(v.id)::int AS vehicle_count
FROM unnest(enum_range(NULL::vehicle_status_enum)) AS st(status)
LEFT JOIN vehicles v
  ON v.status = st.status
 AND v.deleted_at IS NULL
 AND v.is_active
GROUP BY st.status;

-- ---------------------------------------------------------------------------
-- Comprobantes fiscales por mes, tipo y estado (control ante la DGII)
-- ---------------------------------------------------------------------------
-- Facturas y notas de credito en la misma vista, separadas por "document_kind":
-- ante la DGII ambas son e-CF y el control de emitidos/rechazados se lleva
-- sobre las dos. La nota de credito no guarda "ncf_type" porque por definicion
-- es E34; la vista lo hace explicito para que la columna sea comparable.
--
-- El mes es el de emision, con caida a "created_at" mientras el comprobante no
-- se haya emitido (pendiente o rechazado), que es cuando el dato se necesita
-- para saber que quedo sin resolver en el periodo.
--
-- Importe: la factura no lleva monto propio, lo toma de su venta; la nota de
-- credito si lo lleva, y se convierte con la tasa de la venta que corrige.
CREATE VIEW vw_fiscal_documents_summary AS
SELECT
  date_trunc('month', COALESCE(i.issued_at, i.created_at))::date AS month,
  'invoice'::text     AS document_kind,
  i.ncf_type,
  i.status,
  btrim(cur.code)     AS currency_code,
  COUNT(*)::int       AS document_count,
  SUM(s.sale_price)   AS total_amount,
  ROUND(SUM(s.sale_price * s.exchange_rate), 2) AS total_amount_converted
FROM invoices i
JOIN sales s        ON s.id = i.sale_id
JOIN currencies cur ON cur.id = s.currency_id
GROUP BY 1, 2, 3, 4, 5

UNION ALL

SELECT
  date_trunc('month', COALESCE(cn.issued_at, cn.created_at))::date,
  'credit_note'::text,
  'E34'::ncf_type_enum,
  cn.status,
  btrim(cur.code),
  COUNT(*)::int,
  SUM(cn.amount),
  ROUND(SUM(cn.amount * s.exchange_rate), 2)
FROM credit_notes cn
JOIN invoices i     ON i.id = cn.invoice_id
JOIN sales s        ON s.id = i.sale_id
JOIN currencies cur ON cur.id = s.currency_id
GROUP BY 1, 2, 3, 4, 5;
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP VIEW IF EXISTS vw_fiscal_documents_summary;
DROP VIEW IF EXISTS vw_inventory_status_summary;
DROP VIEW IF EXISTS vw_expenses_summary_monthly;
DROP VIEW IF EXISTS vw_sales_by_salesperson;
DROP VIEW IF EXISTS vw_sales_summary_monthly;
DROP VIEW IF EXISTS vw_accounts_receivable;
DROP VIEW IF EXISTS vw_vehicle_profitability;
`).execute(db);
}
