import { type Kysely, sql } from 'kysely';

/**
 * Facturacion electronica (e-CF, DGII Ley 32-23).
 *
 * La firma digital y el envio/validacion ante la DGII los resuelve un PSFE
 * homologado o una integracion directa; estas tablas solo persisten el
 * RESULTADO de ese proceso (numero de comprobante, acuse, XML, motivo de
 * rechazo).
 *
 * Dos decisiones del diseno que se reflejan aqui:
 *
 *  - Ninguna de las dos tablas lleva `deleted_at`. Por ley un comprobante
 *    fiscal no se borra: su ciclo de vida se gobierna con `status`, y anular
 *    una venta ya facturada se hace emitiendo una nota de credito, no
 *    eliminando filas.
 *  - `ncf_number` es NULL hasta que la DGII acepta el comprobante. En Postgres
 *    un UNIQUE admite varios NULL, asi que la unicidad sigue valiendo para los
 *    numeros ya emitidos mientras los pendientes conviven sin numero.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
CREATE TYPE ncf_type_enum AS ENUM ('E31', 'E32', 'E34', 'E44', 'E45');
CREATE TYPE fiscal_doc_status_enum AS ENUM ('pending', 'issued', 'rejected', 'cancelled');

-- ---------------------------------------------------------------------------
-- Comprobante fiscal electronico de una venta
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE: una venta genera un solo comprobante. RESTRICT: la venta no se
  -- puede borrar mientras exista su factura.
  sale_id          UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
  ncf_type         ncf_type_enum NOT NULL,
  ncf_number       VARCHAR(19) UNIQUE,
  status           fiscal_doc_status_enum NOT NULL DEFAULT 'pending',
  issued_at        TIMESTAMPTZ,
  dgii_track_id    VARCHAR(100),
  xml_url          VARCHAR(500),
  rejection_reason TEXT,
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un comprobante emitido SIEMPRE tiene numero y fecha de emision. Sin este
  -- CHECK, un fallo de la aplicacion podria dejar una factura marcada como
  -- emitida sin NCF, que es un documento fiscal invalido.
  CONSTRAINT chk_invoices_issued_has_ncf CHECK (
    status <> 'issued' OR (ncf_number IS NOT NULL AND issued_at IS NOT NULL)
  )
);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_issued_at ON invoices(issued_at);

-- ---------------------------------------------------------------------------
-- Nota de credito (e-CF tipo E34): corrige o anula una factura
-- ---------------------------------------------------------------------------
CREATE TABLE credit_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  ncf_number    VARCHAR(19) UNIQUE,
  reason        TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status        fiscal_doc_status_enum NOT NULL DEFAULT 'pending',
  issued_at     TIMESTAMPTZ,
  dgii_track_id VARCHAR(100),
  xml_url       VARCHAR(500),
  created_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_credit_notes_issued_has_ncf CHECK (
    status <> 'issued' OR (ncf_number IS NOT NULL AND issued_at IS NOT NULL)
  )
);
CREATE INDEX idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX idx_credit_notes_status ON credit_notes(status);

-- Las dos tablas nacen despues del loop generico de la migracion 001, asi que
-- sus triggers de updated_at se declaran aqui.
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_credit_notes_updated_at
  BEFORE UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP TABLE IF EXISTS credit_notes;
DROP TABLE IF EXISTS invoices;
DROP TYPE IF EXISTS fiscal_doc_status_enum;
DROP TYPE IF EXISTS ncf_type_enum;
`).execute(db);
}
