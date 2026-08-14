/**
 * Tipos de la base de datos para Kysely.
 *
 * Este archivo refleja EXACTAMENTE `schema_ejgh_autoimport.sql`. Es la unica
 * pieza del proyecto que habla `snake_case`: nunca debe salir de
 * `infrastructure/`. Los repositorios lo traducen a entidades de dominio en
 * `camelCase` mediante los mappers.
 *
 * Puede regenerarse contra la base real con:
 *   npm run db:codegen
 * (requiere DATABASE_URL apuntando a una BD con el esquema ya migrado).
 */
import type { ColumnType, Generated } from 'kysely';

// --- Alias de tipos de columna ---------------------------------------------

/** TIMESTAMPTZ: se lee como Date, se escribe como Date o string ISO. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

/**
 * Variantes "generadas" (con DEFAULT en la base, opcionales al insertar).
 *
 * No se usa `GeneratedTimestamp` porque `Generated<S>` de Kysely se define
 * como `ColumnType<S, S | undefined, S>`: al pasarle un `ColumnType` lo anida
 * en lugar de ensancharlo, y el tipo de lectura terminaria siendo el propio
 * `ColumnType` en vez de `Date`. Estas variantes lo expresan directamente.
 */
export type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * DATE: el parser de `pg` esta configurado (ver `pg-types.ts`) para devolver
 * la fecha tal cual viene de Postgres (`YYYY-MM-DD`), sin conversion a Date,
 * evitando corrimientos por zona horaria.
 */
export type DateOnly = ColumnType<string, string, string>;

/**
 * NUMERIC: `pg` lo devuelve como string por defecto. El parser configurado en
 * `pg-types.ts` lo convierte a number (los montos del dominio caben de sobra
 * en un double con 2 decimales).
 */
export type Numeric = ColumnType<number, number | string, number | string>;

export type GeneratedNumeric = ColumnType<number, number | string | undefined, number | string>;

// --- ENUMs nativos de Postgres ---------------------------------------------

export type ClientTypeEnum = 'individual' | 'company';
export type VehicleStatusEnum =
  | 'in_transit'
  | 'in_inventory'
  | 'reserved'
  | 'sold'
  | 'in_repair'
  | 'unavailable';
export type PurchaseStatusEnum = 'pending' | 'in_transit' | 'received' | 'cancelled';
export type QuotationStatusEnum = 'pending' | 'approved' | 'rejected' | 'expired' | 'converted';
export type ReservationStatusEnum = 'active' | 'expired' | 'converted' | 'cancelled';
export type SaleStatusEnum = 'in_process' | 'completed' | 'cancelled';
export type ExpenseScopeEnum = 'general' | 'vehicle';
export type AuditActionEnum = 'insert' | 'update' | 'delete';

/** Tipos de e-CF de la DGII (Ley 32-23). */
export type NcfTypeEnum = 'E31' | 'E32' | 'E34' | 'E44' | 'E45';
export type FiscalDocStatusEnum = 'pending' | 'issued' | 'rejected' | 'cancelled';

// --- 1. Catalogos -----------------------------------------------------------

export interface RolesTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface DocumentTypesTable {
  id: Generated<string>;
  name: string;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface CurrenciesTable {
  id: Generated<string>;
  code: string;
  name: string;
  symbol: string;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PaymentMethodsTable {
  id: Generated<string>;
  name: string;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface VehicleBrandsTable {
  id: Generated<string>;
  name: string;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface VehicleModelsTable {
  id: Generated<string>;
  brand_id: string;
  name: string;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ExpenseCategoriesTable {
  id: Generated<string>;
  name: string;
  scope: Generated<ExpenseScopeEnum>;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- 2. Seguridad y auditoria ----------------------------------------------

export interface UsersTable {
  id: Generated<string>;
  role_id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  phone: string | null;
  is_active: Generated<boolean>;
  last_login_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  /** SHA-256 del token en hexadecimal. Nunca se guarda el token en claro. */
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AuditLogsTable {
  id: Generated<string>;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: AuditActionEnum;
  old_data: ColumnType<unknown, unknown, unknown> | null;
  new_data: ColumnType<unknown, unknown, unknown> | null;
  ip_address: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- 3. Clientes y proveedores ---------------------------------------------

export interface ClientsTable {
  id: Generated<string>;
  client_type: Generated<ClientTypeEnum>;
  document_type_id: string;
  document_number: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string;
  address: string | null;
  city: string | null;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface SuppliersTable {
  id: Generated<string>;
  name: string;
  contact_name: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

// --- 4. Inventario ----------------------------------------------------------

export interface VehiclesTable {
  id: Generated<string>;
  brand_id: string;
  model_id: string;
  year: number;
  chassis_number: string;
  color: string | null;
  mileage: number | null;
  engine_number: string | null;
  transmission_type: string | null;
  fuel_type: string | null;
  sale_price: Numeric | null;
  status: Generated<VehicleStatusEnum>;
  notes: string | null;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface VehicleImagesTable {
  id: Generated<string>;
  vehicle_id: string;
  url: string;
  is_primary: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- 5. Compras e importaciones --------------------------------------------

export interface PurchasesTable {
  id: Generated<string>;
  supplier_id: string;
  currency_id: string;
  purchase_number: string;
  invoice_number: string | null;
  purchase_date: DateOnly;
  exchange_rate: GeneratedNumeric;
  status: Generated<PurchaseStatusEnum>;
  created_by: string;
  notes: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface PurchaseItemsTable {
  id: Generated<string>;
  purchase_id: string;
  vehicle_id: string;
  unit_cost: Numeric;
  freight_cost: GeneratedNumeric;
  insurance_cost: GeneratedNumeric;
  other_costs: GeneratedNumeric;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- 6. Gastos --------------------------------------------------------------

export interface ExpensesTable {
  id: Generated<string>;
  category_id: string;
  vehicle_id: string | null;
  currency_id: string;
  payment_method_id: string;
  description: string;
  amount: Numeric;
  exchange_rate: GeneratedNumeric;
  expense_date: DateOnly;
  created_by: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

// --- 7. Ciclo comercial -----------------------------------------------------

export interface QuotationsTable {
  id: Generated<string>;
  quotation_number: string;
  client_id: string;
  vehicle_id: string;
  currency_id: string;
  quoted_price: Numeric;
  valid_until: DateOnly;
  status: Generated<QuotationStatusEnum>;
  created_by: string;
  notes: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface ReservationsTable {
  id: Generated<string>;
  reservation_number: string;
  quotation_id: string | null;
  client_id: string;
  vehicle_id: string;
  deposit_amount: Numeric;
  reservation_date: DateOnly;
  expiration_date: DateOnly;
  status: Generated<ReservationStatusEnum>;
  created_by: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface SalesTable {
  id: Generated<string>;
  sale_number: string;
  reservation_id: string | null;
  quotation_id: string | null;
  client_id: string;
  vehicle_id: string;
  currency_id: string;
  sale_price: Numeric;
  exchange_rate: GeneratedNumeric;
  sale_date: DateOnly;
  status: Generated<SaleStatusEnum>;
  salesperson_id: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
  deleted_at: Timestamp | null;
}

export interface SalePaymentsTable {
  id: Generated<string>;
  sale_id: string;
  payment_method_id: string;
  currency_id: string;
  amount: Numeric;
  payment_date: DateOnly;
  reference_number: string | null;
  received_by: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- 8. Facturacion electronica (e-CF) -------------------------------------

export interface InvoicesTable {
  id: Generated<string>;
  sale_id: string;
  ncf_type: NcfTypeEnum;
  /** NULL hasta que la DGII acepta el comprobante. */
  ncf_number: string | null;
  status: Generated<FiscalDocStatusEnum>;
  issued_at: Timestamp | null;
  dgii_track_id: string | null;
  xml_url: string | null;
  rejection_reason: string | null;
  created_by: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface CreditNotesTable {
  id: Generated<string>;
  invoice_id: string;
  ncf_number: string | null;
  reason: string;
  amount: Numeric;
  status: Generated<FiscalDocStatusEnum>;
  issued_at: Timestamp | null;
  dgii_track_id: string | null;
  xml_url: string | null;
  created_by: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// --- 9. Vistas de reporte (solo lectura) ------------------------------------

/**
 * Las vistas de la migracion 007 se declaran como cualquier otra "tabla" para
 * poder consultarlas con el constructor de queries, pero sus columnas se tipan
 * con tipos planos (`number`, `string`) en vez de `ColumnType`: son de solo
 * lectura y nadie debe insertar ni actualizar sobre ellas.
 *
 * Las columnas `*_converted` vienen ya en la moneda de reporte (DOP); las demas
 * conservan la moneda del documento, indicada en `currency_code`.
 */
export interface VwVehicleProfitabilityTable {
  vehicle_id: string;
  chassis_number: string;
  brand_name: string;
  model_name: string;
  year: number;
  status: VehicleStatusEnum;
  is_active: boolean;
  list_price: number | null;
  purchase_currency_code: string | null;
  purchase_exchange_rate: number | null;
  import_subtotal: number;
  import_subtotal_converted: number;
  expenses_total_converted: number;
  total_cost_converted: number;
  /** NULL mientras el vehiculo no tenga una venta vigente. */
  sale_id: string | null;
  sale_number: string | null;
  sale_status: SaleStatusEnum | null;
  sale_date: string | null;
  sale_currency_code: string | null;
  sold_price: number | null;
  sold_price_converted: number | null;
  margin: number | null;
  margin_percentage: number | null;
}

export interface VwAccountsReceivableTable {
  sale_id: string;
  sale_number: string;
  sale_date: string;
  sale_status: SaleStatusEnum;
  client_id: string;
  client_name: string;
  client_phone: string;
  vehicle_id: string;
  chassis_number: string;
  salesperson_id: string;
  salesperson_name: string;
  currency_code: string;
  exchange_rate: number;
  sale_price: number;
  total_paid: number;
  pending_balance: number;
  pending_balance_converted: number;
  days_outstanding: number;
}

export interface VwSalesSummaryMonthlyTable {
  /** Primer dia del mes (`YYYY-MM-01`). */
  month: string;
  currency_code: string;
  sales_count: number;
  total_amount: number;
  total_amount_converted: number;
}

export interface VwSalesBySalespersonTable {
  month: string;
  salesperson_id: string;
  salesperson_name: string;
  currency_code: string;
  sales_count: number;
  total_amount: number;
  total_amount_converted: number;
}

export interface VwExpensesSummaryMonthlyTable {
  month: string;
  category_id: string;
  category_name: string;
  scope: ExpenseScopeEnum;
  currency_code: string;
  expense_count: number;
  total_amount: number;
  total_amount_converted: number;
}

export interface VwInventoryStatusSummaryTable {
  status: VehicleStatusEnum;
  vehicle_count: number;
}

export type FiscalDocumentKind = 'invoice' | 'credit_note';

export interface VwFiscalDocumentsSummaryTable {
  month: string;
  document_kind: FiscalDocumentKind;
  ncf_type: NcfTypeEnum;
  status: FiscalDocStatusEnum;
  currency_code: string;
  document_count: number;
  total_amount: number;
  total_amount_converted: number;
}

// --- Mapa de la base de datos ----------------------------------------------

export interface DB {
  audit_logs: AuditLogsTable;
  clients: ClientsTable;
  credit_notes: CreditNotesTable;
  currencies: CurrenciesTable;
  document_types: DocumentTypesTable;
  expense_categories: ExpenseCategoriesTable;
  expenses: ExpensesTable;
  invoices: InvoicesTable;
  payment_methods: PaymentMethodsTable;
  purchase_items: PurchaseItemsTable;
  purchases: PurchasesTable;
  quotations: QuotationsTable;
  refresh_tokens: RefreshTokensTable;
  reservations: ReservationsTable;
  roles: RolesTable;
  sale_payments: SalePaymentsTable;
  sales: SalesTable;
  suppliers: SuppliersTable;
  users: UsersTable;
  vehicle_brands: VehicleBrandsTable;
  vehicle_images: VehicleImagesTable;
  vehicle_models: VehicleModelsTable;
  vehicles: VehiclesTable;

  // Vistas de reporte (migracion 007). Solo lectura.
  vw_accounts_receivable: VwAccountsReceivableTable;
  vw_expenses_summary_monthly: VwExpensesSummaryMonthlyTable;
  vw_fiscal_documents_summary: VwFiscalDocumentsSummaryTable;
  vw_inventory_status_summary: VwInventoryStatusSummaryTable;
  vw_sales_by_salesperson: VwSalesBySalespersonTable;
  vw_sales_summary_monthly: VwSalesSummaryMonthlyTable;
  vw_vehicle_profitability: VwVehicleProfitabilityTable;
}
