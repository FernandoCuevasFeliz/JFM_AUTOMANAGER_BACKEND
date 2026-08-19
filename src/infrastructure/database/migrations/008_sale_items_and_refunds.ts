import { type Kysely, sql } from 'kysely';

/**
 * Venta de varios vehiculos (cabecera + detalle) y reembolsos.
 *
 * Hasta aqui una venta era un vehiculo: `sales.vehicle_id` + `sales.sale_price`.
 * Eso impedia vender una flotilla en un solo documento y obligaba a cancelar la
 * venta entera para devolver una unidad. Esta migracion parte `sales` en
 * cabecera y detalle, igual que `purchases`/`purchase_items`:
 *
 *   sales (quien, cuando, en que moneda)
 *     +-- sale_items   (que vehiculos y a que precio cada uno)
 *     +-- sale_payments (dinero que entro)
 *     +-- refunds       (dinero que salio de vuelta al cliente)
 *
 * Consecuencias que atraviesan todo el esquema:
 *
 *  - El importe de una venta deja de ser una columna y pasa a ser
 *    `SUM(sale_items.sale_price)` de las lineas `active`. Devolver un vehiculo
 *    no reescribe el total historico: saca la linea del agregado. Por eso la
 *    factura ya emitida no se desincroniza.
 *  - `refunds` es una tabla aparte de `sale_payments` a proposito. Meter
 *    importes negativos en `sale_payments` rompeia su `CHECK (amount > 0)` y,
 *    peor, su significado: esa tabla responde "cuanto entro", no "cuanto neto".
 *  - `credit_notes.sale_item_id` ata la nota de credito al vehiculo devuelto,
 *    para poder acreditar una unidad sin anular la factura completa.
 *
 * UNICIDAD DEL VEHICULO — desviacion deliberada del documento de esquema.
 * El documento pide `sale_items.vehicle_id UNIQUE` a secas. Aplicado tal cual,
 * un vehiculo cuya venta se cancelo no podria volver a venderse NUNCA, que es
 * exactamente el defecto que corrigio la migracion 003 con su indice unico
 * parcial. Aqui se conserva esa correccion: el indice unico es PARCIAL sobre
 * las lineas `active`, y cancelar una venta marca sus lineas como `returned`
 * (los vehiculos vuelven a inventario, que es lo que cancelar significa). La
 * regla de negocio real —"un vehiculo no puede estar en dos ventas vigentes a
 * la vez"— queda igual de garantizada, sin perder la trazabilidad.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(`
-- ---------------------------------------------------------------------------
-- 1. Las vistas que leen sales.vehicle_id / sales.sale_price estorban al ALTER
-- ---------------------------------------------------------------------------
-- Postgres no deja soltar una columna de la que depende una vista. Se bajan las
-- cinco afectadas y se vuelven a crear al final, ya con la nueva definicion.
-- Las otras dos de la migracion 007 (gastos e inventario) no tocan sales y se
-- quedan donde estan.
DROP VIEW IF EXISTS vw_fiscal_documents_summary;
DROP VIEW IF EXISTS vw_sales_by_salesperson;
DROP VIEW IF EXISTS vw_sales_summary_monthly;
DROP VIEW IF EXISTS vw_accounts_receivable;
DROP VIEW IF EXISTS vw_vehicle_profitability;

-- ---------------------------------------------------------------------------
-- 2. Detalle de la venta
-- ---------------------------------------------------------------------------
CREATE TYPE sale_item_status_enum AS ENUM ('active', 'returned');

CREATE TABLE sale_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE: la linea no tiene vida propia fuera de su venta. La venta, a su
  -- vez, no se borra fisicamente (usa deleted_at), asi que en la practica esto
  -- solo actua si algun dia se purga historico.
  sale_id       UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  -- RESTRICT: un vehiculo con historial de venta no se borra de la base.
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  sale_price    NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
  status        sale_item_status_enum NOT NULL DEFAULT 'active',
  returned_at   TIMESTAMPTZ,
  return_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Una linea devuelta SIEMPRE dice cuando y por que. Sin esto, una devolucion
  -- registrada a medias seria indistinguible de un cambio de estado accidental.
  CONSTRAINT chk_sale_items_returned_has_reason CHECK (
    status <> 'returned' OR (returned_at IS NOT NULL AND return_reason IS NOT NULL)
  )
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_status ON sale_items(status);
CREATE INDEX idx_sale_items_vehicle ON sale_items(vehicle_id);

-- Sustituye a uq_sales_vehicle_active (migracion 003): un vehiculo, como mucho,
-- en una linea vigente. Las devueltas y las de ventas canceladas no bloquean.
CREATE UNIQUE INDEX uq_sale_items_vehicle_active
  ON sale_items(vehicle_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Reembolsos
-- ---------------------------------------------------------------------------
CREATE TABLE refunds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT en las dos: un reembolso es movimiento de dinero y no desaparece
  -- porque se archive el documento que lo origino.
  sale_id          UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  -- NULL = reembolso general de la venta (un descuento pactado, un ajuste),
  -- no atribuible a la devolucion de una unidad concreta.
  sale_item_id     UUID REFERENCES sale_items(id) ON DELETE RESTRICT,
  refund_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  currency_id      UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  -- Tasa del dia en que se devolvio el dinero, no la de la venta: el documento
  -- de esquema no la trae, pero sin ella un reembolso en dolares no se puede
  -- consolidar a pesos con el mismo criterio de costo historico que usa el
  -- resto del sistema (ver domain/shared/money.ts y la migracion 005, que
  -- agrego esta misma columna a expenses por identica razon).
  exchange_rate    NUMERIC(10,4) NOT NULL DEFAULT 1,
  refund_date      DATE NOT NULL,
  reason           TEXT NOT NULL,
  processed_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_sale ON refunds(sale_id);
CREATE INDEX idx_refunds_sale_item ON refunds(sale_item_id);
CREATE INDEX idx_refunds_date ON refunds(refund_date);

-- ---------------------------------------------------------------------------
-- 4. La nota de credito puede apuntar al vehiculo devuelto
-- ---------------------------------------------------------------------------
-- SET NULL y no RESTRICT: si algun dia se purgara la linea, la nota de credito
-- —documento fiscal— tiene que sobrevivir aunque pierda el detalle.
ALTER TABLE credit_notes
  ADD COLUMN sale_item_id UUID REFERENCES sale_items(id) ON DELETE SET NULL;
CREATE INDEX idx_credit_notes_sale_item ON credit_notes(sale_item_id);

-- ---------------------------------------------------------------------------
-- 5. Traslado de los datos existentes
-- ---------------------------------------------------------------------------
-- Cada venta actual es, por definicion, una venta de un solo vehiculo: se
-- convierte en su unica linea. El orden importa —primero copiar, despues soltar
-- las columnas— porque la copia lee justamente lo que se va a soltar.
INSERT INTO sale_items (sale_id, vehicle_id, sale_price, status, returned_at, return_reason, created_at, updated_at)
SELECT
  s.id,
  s.vehicle_id,
  s.sale_price,
  -- Una venta cancelada (o archivada, que solo ocurre despues de cancelar) ya
  -- devolvio su vehiculo a inventario: su linea nace 'returned' para que el
  -- indice unico parcial refleje el estado real y la unidad pueda revenderse.
  CASE
    WHEN s.status = 'cancelled' OR s.deleted_at IS NOT NULL THEN 'returned'
    ELSE 'active'
  END::sale_item_status_enum,
  CASE
    WHEN s.status = 'cancelled' OR s.deleted_at IS NOT NULL THEN COALESCE(s.deleted_at, s.updated_at)
  END,
  CASE
    WHEN s.status = 'cancelled' OR s.deleted_at IS NOT NULL THEN 'Venta cancelada antes de la migracion 008'
  END,
  s.created_at,
  s.updated_at
FROM sales s;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_vehicle_id_fkey;
DROP INDEX IF EXISTS uq_sales_vehicle_active;
ALTER TABLE sales DROP COLUMN vehicle_id;
ALTER TABLE sales DROP COLUMN sale_price;

-- Las dos tablas nuevas nacen despues del loop generico de la migracion 001.
CREATE TRIGGER trg_sale_items_updated_at
  BEFORE UPDATE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Vistas de reporte, reconstruidas sobre el detalle
-- ---------------------------------------------------------------------------
-- Criterios de la migracion 007 intactos: borrado logico filtrado, importes
-- expuestos en la moneda del documento y convertidos (*_converted) con la tasa
-- registrada en cada documento, y currencies.code normalizado con btrim.
--
-- Lo que cambia es de donde sale el importe: ya no de sales.sale_price sino de
-- la suma de las lineas ACTIVE. Una linea devuelta desaparece del agregado sin
-- reescribir nada.

-- Suma vigente de cada venta. Se repite en cuatro vistas, asi que se nombra una
-- sola vez; es una vista auxiliar, no un reporte que se exponga por la API.
CREATE VIEW vw_sale_totals AS
SELECT
  s.id AS sale_id,
  COALESCE(SUM(si.sale_price) FILTER (WHERE si.status = 'active'), 0) AS active_total,
  -- Total de TODAS las lineas, devueltas incluidas. Es el importe que se
  -- facturo: un comprobante no encoge porque despues se devuelva un vehiculo,
  -- lo corrige una nota de credito. Ver vw_fiscal_documents_summary.
  COALESCE(SUM(si.sale_price), 0) AS invoiced_total,
  COUNT(*)      FILTER (WHERE si.status = 'active')::int   AS active_items,
  COUNT(*)      FILTER (WHERE si.status = 'returned')::int AS returned_items
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
GROUP BY s.id;

-- Rentabilidad por vehiculo: costo real (compra + gastos) vs precio de venta
-- El costo real cruza tres origenes y cada uno trae su propia tasa:
--   purchase_items -> lo que costo traer la unidad (compra, flete, seguro, otros)
--   expenses       -> todo lo gastado en ella despues (taller, placas, etc.)
--   sale_items     -> a cuanto se vendio, si su linea sigue vigente
-- Un vehiculo sin compra ni gastos ni venta igual aparece, con ceros y NULL.
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
  -- Linea vigente del vehiculo. El indice unico parcial
  -- uq_sale_items_vehicle_active garantiza que hay una como mucho: ni una venta
  -- cancelada (lineas 'returned') ni un vehiculo devuelto consumen la unidad.
  SELECT
    si.vehicle_id,
    si.id      AS sale_item_id,
    si.sale_price,
    s.id       AS sale_id,
    s.sale_number,
    s.status   AS sale_status,
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
  s.sale_id,
  s.sale_item_id,
  s.sale_number,
  s.sale_status,
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
      WHEN s.sale_id IS NULL THEN NULL
      ELSE ROUND(s.sale_price * s.exchange_rate, 2)
    END AS sold_converted
) t
WHERE v.deleted_at IS NULL;

-- Cuentas por cobrar: saldo pendiente por venta
-- Saldo = lineas vigentes - (cobrado - reembolsado). Los reembolsos SUMAN al
-- saldo porque deshacen un cobro: si se le devolvio dinero al cliente, ese
-- dinero vuelve a estar pendiente sobre lo que quede vendido.
-- Cobros y reembolsos se registran en la moneda de la venta (lo garantizan
-- "register-sale-payment" y "register-refund"), asi que la resta es entre
-- importes homogeneos y la tasa de la venta convierte el saldo.
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
  s.salesperson_id,
  u.first_name || ' ' || u.last_name AS salesperson_name,
  btrim(cur.code)               AS currency_code,
  s.exchange_rate,
  tot.active_items,
  tot.returned_items,
  -- Los chasis vigentes concatenados. Una venta puede llevar varios y el reporte
  -- necesita mostrarlos y poder buscarlos sin abrir el detalle; un JOIN habria
  -- duplicado la fila de la venta una vez por vehiculo.
  (
    SELECT string_agg(v.chassis_number, ', ' ORDER BY si.created_at)
    FROM sale_items si
    JOIN vehicles v ON v.id = si.vehicle_id
    WHERE si.sale_id = s.id AND si.status = 'active'
  )                             AS chassis_numbers,
  tot.active_total              AS sale_price,
  t.total_paid,
  t.total_refunded,
  t.pending_balance,
  ROUND(t.pending_balance * s.exchange_rate, 2) AS pending_balance_converted,
  (CURRENT_DATE - s.sale_date)::int AS days_outstanding
FROM sales s
JOIN clients c        ON c.id = s.client_id
JOIN users u          ON u.id = s.salesperson_id
JOIN currencies cur   ON cur.id = s.currency_id
JOIN vw_sale_totals tot ON tot.sale_id = s.id
LEFT JOIN (
  SELECT sale_id, SUM(amount) AS total_paid
  FROM sale_payments
  GROUP BY sale_id
) pay ON pay.sale_id = s.id
LEFT JOIN (
  SELECT sale_id, SUM(amount) AS total_refunded
  FROM refunds
  GROUP BY sale_id
) ref ON ref.sale_id = s.id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(pay.total_paid, 0)     AS total_paid,
    COALESCE(ref.total_refunded, 0) AS total_refunded,
    -- GREATEST evita un saldo negativo si alguna vez se cobrara de mas.
    GREATEST(
      tot.active_total - (COALESCE(pay.total_paid, 0) - COALESCE(ref.total_refunded, 0)),
      0
    ) AS pending_balance
) t
WHERE s.status <> 'cancelled'
  AND s.deleted_at IS NULL;

-- Ventas completadas por mes y moneda
-- Solo 'completed': una venta en proceso todavia puede caerse y no es ingreso
-- reconocido. Se cuentan dos cosas distintas, que con varios vehiculos por
-- venta dejan de coincidir: documentos (sales_count) y unidades entregadas
-- (vehicles_count). El mes se expone como DATE (dia 1) para que ordene y filtre
-- como fecha, no como texto.
CREATE VIEW vw_sales_summary_monthly AS
SELECT
  date_trunc('month', s.sale_date)::date AS month,
  btrim(cur.code)                        AS currency_code,
  COUNT(DISTINCT s.id)::int              AS sales_count,
  COUNT(*)::int                          AS vehicles_count,
  SUM(si.sale_price)                     AS total_amount,
  ROUND(SUM(si.sale_price * s.exchange_rate), 2) AS total_amount_converted
FROM sales s
JOIN sale_items si  ON si.sale_id = s.id AND si.status = 'active'
JOIN currencies cur ON cur.id = s.currency_id
WHERE s.status = 'completed'
  AND s.deleted_at IS NULL
GROUP BY 1, 2;

-- Desempeno por vendedor: ventas completadas por vendedor, mes y moneda
CREATE VIEW vw_sales_by_salesperson AS
SELECT
  date_trunc('month', s.sale_date)::date AS month,
  s.salesperson_id,
  u.first_name || ' ' || u.last_name     AS salesperson_name,
  btrim(cur.code)                        AS currency_code,
  COUNT(DISTINCT s.id)::int              AS sales_count,
  COUNT(*)::int                          AS vehicles_count,
  SUM(si.sale_price)                     AS total_amount,
  ROUND(SUM(si.sale_price * s.exchange_rate), 2) AS total_amount_converted
FROM sales s
JOIN sale_items si  ON si.sale_id = s.id AND si.status = 'active'
JOIN users u        ON u.id = s.salesperson_id
JOIN currencies cur ON cur.id = s.currency_id
WHERE s.status = 'completed'
  AND s.deleted_at IS NULL
GROUP BY 1, 2, 3, 4;

-- Devoluciones por mes: cuantas unidades volvieron y cuanto valian
-- Es la tasa de devolucion, que sin el detalle no se podia medir. Se cuentan
-- solo las devoluciones PARCIALES (la venta sigue viva): una venta cancelada
-- por completo tambien marca sus lineas como devueltas, pero es otro evento del
-- negocio —el documento entero se cayo— y mezclarlos ocultaria las dos cifras.
-- El mes es el de la devolucion, no el de la venta.
CREATE VIEW vw_returns_summary_monthly AS
SELECT
  date_trunc('month', si.returned_at)::date AS month,
  btrim(cur.code)                           AS currency_code,
  COUNT(*)::int                             AS returned_count,
  COUNT(DISTINCT s.id)::int                 AS sales_count,
  SUM(si.sale_price)                        AS total_amount,
  ROUND(SUM(si.sale_price * s.exchange_rate), 2) AS total_amount_converted,
  COALESCE(SUM(r.refunded), 0)              AS total_refunded,
  ROUND(COALESCE(SUM(r.refunded * s.exchange_rate), 0), 2) AS total_refunded_converted
FROM sale_items si
JOIN sales s        ON s.id = si.sale_id
JOIN currencies cur ON cur.id = s.currency_id
LEFT JOIN (
  SELECT sale_item_id, SUM(amount) AS refunded
  FROM refunds
  WHERE sale_item_id IS NOT NULL
  GROUP BY sale_item_id
) r ON r.sale_item_id = si.id
WHERE si.status = 'returned'
  AND si.returned_at IS NOT NULL
  AND s.status <> 'cancelled'
  AND s.deleted_at IS NULL
GROUP BY 1, 2;

-- Comprobantes fiscales por mes, tipo y estado (control ante la DGII)
-- Facturas y notas de credito en la misma vista, separadas por "document_kind":
-- ante la DGII ambas son e-CF y el control de emitidos/rechazados se lleva
-- sobre las dos. La nota de credito no guarda "ncf_type" porque por definicion
-- es E34; la vista lo hace explicito para que la columna sea comparable.
--
-- El mes es el de emision, con caida a "created_at" mientras el comprobante no
-- se haya emitido (pendiente o rechazado), que es cuando el dato se necesita
-- para saber que quedo sin resolver en el periodo.
--
-- Importe: la factura no lleva monto propio, lo toma de su venta, y toma el
-- total FACTURADO —todas las lineas, devueltas incluidas—, no el vigente. Un
-- comprobante emitido no se encoge porque luego se devuelva un vehiculo: eso lo
-- corrige la nota de credito, que aparece en esta misma vista como documento
-- aparte. Con el total vigente, la devolucion habria descontado el importe dos
-- veces: una al salir la linea y otra al emitirse la nota.
-- La nota de credito si lleva monto propio, convertido con la tasa de la venta.
CREATE VIEW vw_fiscal_documents_summary AS
SELECT
  date_trunc('month', COALESCE(i.issued_at, i.created_at))::date AS month,
  'invoice'::text     AS document_kind,
  i.ncf_type,
  i.status,
  btrim(cur.code)     AS currency_code,
  COUNT(*)::int       AS document_count,
  SUM(tot.invoiced_total) AS total_amount,
  ROUND(SUM(tot.invoiced_total * s.exchange_rate), 2) AS total_amount_converted
FROM invoices i
JOIN sales s            ON s.id = i.sale_id
JOIN vw_sale_totals tot ON tot.sale_id = s.id
JOIN currencies cur     ON cur.id = s.currency_id
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
`)
    .execute(db);
}

/**
 * Vuelve al esquema de un vehiculo por venta.
 *
 * PERDIDA DE DATOS INEVITABLE: si alguna venta llego a tener mas de un vehiculo,
 * `sales` solo puede recuperar uno. Se toma la linea vigente mas antigua y se
 * suma el importe de todas las vigentes, para que el total de la venta no
 * cambie aunque el vehiculo asociado sea uno solo. Los reembolsos se pierden por
 * completo: no habia donde guardarlos antes de esta migracion.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(`
DROP VIEW IF EXISTS vw_fiscal_documents_summary;
DROP VIEW IF EXISTS vw_returns_summary_monthly;
DROP VIEW IF EXISTS vw_sales_by_salesperson;
DROP VIEW IF EXISTS vw_sales_summary_monthly;
DROP VIEW IF EXISTS vw_accounts_receivable;
DROP VIEW IF EXISTS vw_vehicle_profitability;
DROP VIEW IF EXISTS vw_sale_totals;

DROP INDEX IF EXISTS idx_credit_notes_sale_item;
ALTER TABLE credit_notes DROP COLUMN IF EXISTS sale_item_id;

ALTER TABLE sales ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE RESTRICT;
ALTER TABLE sales ADD COLUMN sale_price NUMERIC(12,2);

UPDATE sales s
SET vehicle_id = pick.vehicle_id,
    sale_price = pick.total
FROM (
  SELECT DISTINCT ON (si.sale_id)
    si.sale_id,
    si.vehicle_id,
    SUM(si.sale_price) OVER (PARTITION BY si.sale_id) AS total
  FROM sale_items si
  ORDER BY si.sale_id, (si.status = 'active') DESC, si.created_at ASC
) pick
WHERE pick.sale_id = s.id;

-- Una venta sin lineas no puede existir en el modelo antiguo; no deberia haber
-- ninguna, pero si la hubiera se queda en cero antes de imponer el NOT NULL.
UPDATE sales SET sale_price = 0 WHERE sale_price IS NULL;

DELETE FROM sales WHERE vehicle_id IS NULL;

ALTER TABLE sales ALTER COLUMN vehicle_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN sale_price SET NOT NULL;
ALTER TABLE sales ADD CONSTRAINT sales_sale_price_check CHECK (sale_price >= 0);

CREATE UNIQUE INDEX uq_sales_vehicle_active
  ON sales(vehicle_id)
  WHERE status <> 'cancelled' AND deleted_at IS NULL;

DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS sale_items;
DROP TYPE IF EXISTS sale_item_status_enum;
`)
    .execute(db);

  // Las cinco vistas de la 007 que dependen de las columnas restauradas.
  const { up: recreateReportViews } = await import('./007_report_views');
  await sql
    .raw(`
DROP VIEW IF EXISTS vw_expenses_summary_monthly;
DROP VIEW IF EXISTS vw_inventory_status_summary;
`)
    .execute(db);
  await recreateReportViews(db);
}
