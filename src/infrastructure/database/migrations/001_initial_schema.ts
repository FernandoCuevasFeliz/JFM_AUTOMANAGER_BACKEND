import { type Kysely, sql } from 'kysely';

/**
 * Esquema inicial de EJGH Autoimport S.R.L.
 *
 * Es una transcripcion literal de `schema_ejgh_autoimport.sql` (secciones 0 a
 * 8). El DDL se ejecuta como SQL crudo en lugar de reconstruirlo con el
 * constructor de esquemas de Kysely para que el archivo entregado por el
 * diseno de base de datos siga siendo la fuente de verdad, sin traducciones
 * intermedias que puedan introducir diferencias.
 *
 * La semilla de catalogos vive en la migracion 002 para poder recrear el
 * esquema sin datos cuando haga falta (por ejemplo, en pruebas).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
-- 0. EXTENSIONES Y TIPOS ENUMERADOS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE client_type_enum        AS ENUM ('individual', 'company');
CREATE TYPE vehicle_status_enum     AS ENUM ('in_transit', 'in_inventory', 'reserved', 'sold', 'in_repair', 'unavailable');
CREATE TYPE purchase_status_enum    AS ENUM ('pending', 'in_transit', 'received', 'cancelled');
CREATE TYPE quotation_status_enum   AS ENUM ('pending', 'approved', 'rejected', 'expired', 'converted');
CREATE TYPE reservation_status_enum AS ENUM ('active', 'expired', 'converted', 'cancelled');
CREATE TYPE sale_status_enum        AS ENUM ('in_process', 'completed', 'cancelled');
CREATE TYPE expense_scope_enum      AS ENUM ('general', 'vehicle');
CREATE TYPE audit_action_enum       AS ENUM ('insert', 'update', 'delete');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. TABLAS CATALOGO / MAESTRAS
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50)  NOT NULL UNIQUE,
  description VARCHAR(255),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(50) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE currencies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       CHAR(3) NOT NULL UNIQUE,
  name       VARCHAR(50) NOT NULL,
  symbol     VARCHAR(5) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(50) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_brands (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(80) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_models (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES vehicle_brands(id) ON DELETE RESTRICT,
  name       VARCHAR(80) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_brand_model UNIQUE (brand_id, name)
);
CREATE INDEX idx_vehicle_models_brand ON vehicle_models(brand_id);

CREATE TABLE expense_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  scope      expense_scope_enum NOT NULL DEFAULT 'general',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SEGURIDAD
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  phone          VARCHAR(30),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id  UUID,
  action     audit_action_enum NOT NULL,
  old_data   JSONB,
  new_data   JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- 3. CLIENTES Y PROVEEDORES
CREATE TABLE clients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_type      client_type_enum NOT NULL DEFAULT 'individual',
  document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  document_number  VARCHAR(30) NOT NULL,
  first_name       VARCHAR(100),
  last_name        VARCHAR(100),
  company_name     VARCHAR(150),
  email            VARCHAR(150),
  phone            VARCHAR(30) NOT NULL,
  address          VARCHAR(255),
  city             VARCHAR(100),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT uq_client_document UNIQUE (document_type_id, document_number)
);
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_name ON clients(last_name, first_name);

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(150) NOT NULL,
  contact_name    VARCHAR(100),
  document_number VARCHAR(30),
  email           VARCHAR(150),
  phone           VARCHAR(30),
  address         VARCHAR(255),
  country         VARCHAR(80),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- 4. INVENTARIO
CREATE TABLE vehicles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID NOT NULL REFERENCES vehicle_brands(id) ON DELETE RESTRICT,
  model_id           UUID NOT NULL REFERENCES vehicle_models(id) ON DELETE RESTRICT,
  year               SMALLINT NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  chassis_number     VARCHAR(30) NOT NULL UNIQUE,
  color              VARCHAR(40),
  mileage            INTEGER CHECK (mileage >= 0),
  engine_number      VARCHAR(50),
  transmission_type  VARCHAR(20),
  fuel_type          VARCHAR(20),
  sale_price         NUMERIC(12,2),
  status             vehicle_status_enum NOT NULL DEFAULT 'in_transit',
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_brand_model ON vehicles(brand_id, model_id);

CREATE TABLE vehicle_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url        VARCHAR(500) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_images_vehicle ON vehicle_images(vehicle_id);

-- 5. COMPRAS E IMPORTACIONES
CREATE TABLE purchases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  currency_id      UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  purchase_number  VARCHAR(30) NOT NULL UNIQUE,
  invoice_number   VARCHAR(50),
  purchase_date    DATE NOT NULL,
  exchange_rate    NUMERIC(10,4) NOT NULL DEFAULT 1,
  status           purchase_status_enum NOT NULL DEFAULT 'pending',
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_date ON purchases(purchase_date);

CREATE TABLE purchase_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id    UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  vehicle_id     UUID NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE RESTRICT,
  unit_cost      NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  freight_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
  insurance_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_costs    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

-- 6. GASTOS
CREATE TABLE expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE RESTRICT,
  currency_id       UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  description       VARCHAR(255) NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date      DATE NOT NULL,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_expenses_vehicle ON expenses(vehicle_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- 7. VENTAS
CREATE TABLE quotations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number VARCHAR(30) NOT NULL UNIQUE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  vehicle_id       UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  currency_id      UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  quoted_price     NUMERIC(12,2) NOT NULL CHECK (quoted_price >= 0),
  valid_until      DATE NOT NULL,
  status           quotation_status_enum NOT NULL DEFAULT 'pending',
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_quotations_client ON quotations(client_id);
CREATE INDEX idx_quotations_vehicle ON quotations(vehicle_id);
CREATE INDEX idx_quotations_status ON quotations(status);

CREATE TABLE reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_number VARCHAR(30) NOT NULL UNIQUE,
  quotation_id       UUID REFERENCES quotations(id) ON DELETE SET NULL,
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  vehicle_id         UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  deposit_amount     NUMERIC(12,2) NOT NULL CHECK (deposit_amount >= 0),
  reservation_date   DATE NOT NULL,
  expiration_date    DATE NOT NULL,
  status             reservation_status_enum NOT NULL DEFAULT 'active',
  created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX idx_reservations_client ON reservations(client_id);
CREATE INDEX idx_reservations_vehicle ON reservations(vehicle_id);
CREATE INDEX idx_reservations_status ON reservations(status);

CREATE TABLE sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number    VARCHAR(30) NOT NULL UNIQUE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  quotation_id   UUID REFERENCES quotations(id) ON DELETE SET NULL,
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  vehicle_id     UUID NOT NULL UNIQUE REFERENCES vehicles(id) ON DELETE RESTRICT,
  currency_id    UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  sale_price     NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
  exchange_rate  NUMERIC(10,4) NOT NULL DEFAULT 1,
  sale_date      DATE NOT NULL,
  status         sale_status_enum NOT NULL DEFAULT 'in_process',
  salesperson_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_sales_client ON sales(client_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_salesperson ON sales(salesperson_id);

CREATE TABLE sale_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  currency_id       UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date      DATE NOT NULL,
  reference_number  VARCHAR(50),
  received_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);

-- 8. TRIGGERS updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
DROP TABLE IF EXISTS sale_payments;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS quotations;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS purchase_items;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS vehicle_images;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS expense_categories;
DROP TABLE IF EXISTS vehicle_models;
DROP TABLE IF EXISTS vehicle_brands;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS currencies;
DROP TABLE IF EXISTS document_types;
DROP TABLE IF EXISTS roles;

DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS audit_action_enum;
DROP TYPE IF EXISTS expense_scope_enum;
DROP TYPE IF EXISTS sale_status_enum;
DROP TYPE IF EXISTS reservation_status_enum;
DROP TYPE IF EXISTS quotation_status_enum;
DROP TYPE IF EXISTS purchase_status_enum;
DROP TYPE IF EXISTS vehicle_status_enum;
DROP TYPE IF EXISTS client_type_enum;
`).execute(db);
}
