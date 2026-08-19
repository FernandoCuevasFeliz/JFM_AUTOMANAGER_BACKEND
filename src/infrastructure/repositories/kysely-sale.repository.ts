import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  type NewRefund,
  type NewSale,
  type NewSaleItem,
  type NewSalePayment,
  pendingBalance,
  type Refund,
  type RefundWithDetails,
  type Sale,
  type SaleItem,
  type SaleItemReturn,
  type SaleItemWithDetails,
  type SalePayment,
  type SalePaymentWithDetails,
  type SaleStatus,
  type SaleUpdate,
  type SaleWithDetails,
  saleTotal,
  totalPaid as sumPayments,
  totalRefunded as sumRefunds,
} from '../../domain/sales/sale.entity';
import type {
  SaleFilters,
  SaleRepository,
  SalesSummary,
} from '../../domain/sales/sale.repository';
import { REPORTING_CURRENCY_CODE } from '../../domain/shared/money';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type {
  RefundsTable,
  SaleItemsTable,
  SalePaymentsTable,
  SalesTable,
} from '../database/database.types';
import { isEmptyPatch, likePattern, round2, toDate, toNullableDate, toNumber } from './mappers';

const CLIENT_NAME = sql<string>`coalesce(clients.company_name, clients.first_name || ' ' || clients.last_name)`;
const SALESPERSON_NAME = sql<string>`users.first_name || ' ' || users.last_name`;

function mapItem(row: Selectable<SaleItemsTable>): SaleItem {
  return {
    id: row.id,
    saleId: row.sale_id,
    vehicleId: row.vehicle_id,
    salePrice: toNumber(row.sale_price),
    status: row.status,
    returnedAt: toNullableDate(row.returned_at),
    returnReason: row.return_reason,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapSale(row: Selectable<SalesTable>, items: readonly SaleItem[]): Sale {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    reservationId: row.reservation_id,
    quotationId: row.quotation_id,
    clientId: row.client_id,
    currencyId: row.currency_id,
    exchangeRate: toNumber(row.exchange_rate),
    saleDate: row.sale_date,
    status: row.status,
    salespersonId: row.salesperson_id,
    items,
    salePrice: saleTotal(items),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

function mapPayment(row: Selectable<SalePaymentsTable>): SalePayment {
  return {
    id: row.id,
    saleId: row.sale_id,
    paymentMethodId: row.payment_method_id,
    currencyId: row.currency_id,
    amount: toNumber(row.amount),
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number,
    receivedBy: row.received_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapRefund(row: Selectable<RefundsTable>): Refund {
  return {
    id: row.id,
    saleId: row.sale_id,
    saleItemId: row.sale_item_id,
    refundMethodId: row.refund_method_id,
    currencyId: row.currency_id,
    amount: toNumber(row.amount),
    exchangeRate: toNumber(row.exchange_rate),
    refundDate: row.refund_date,
    reason: row.reason,
    processedBy: row.processed_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

type SaleDetailRow = Selectable<SalesTable> & {
  client_name: string;
  currency_code: string;
  salesperson_name: string;
  reservation_number: string | null;
  quotation_number: string | null;
};

/** Todas las colecciones del agregado, resueltas de una sola vez por pagina. */
interface SaleChildren {
  readonly items: SaleItemWithDetails[];
  readonly payments: SalePaymentWithDetails[];
  readonly refunds: RefundWithDetails[];
}

const NO_CHILDREN: SaleChildren = { items: [], payments: [], refunds: [] };

export class KyselySaleRepository implements SaleRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Sale | null> {
    const row = await this.db
      .selectFrom('sales')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row, await this.listItems(id));
  }

  async findByIdWithDetails(id: string): Promise<SaleWithDetails | null> {
    const row = await this.detailQuery()
      .where('sales.id', '=', id)
      .where('sales.deleted_at', 'is', null)
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    const children = (await this.loadChildren([id])).get(id) ?? NO_CHILDREN;
    return this.mapDetail(row, children);
  }

  /**
   * La venta VIGENTE que incluye el vehiculo. Vigente significa las tres cosas
   * a la vez: linea activa, venta no cancelada y venta no archivada. Es el mismo
   * predicado que usa `isVehicleSold` y que refleja el indice unico parcial.
   */
  async findByVehicleId(vehicleId: string): Promise<Sale | null> {
    const row = await this.db
      .selectFrom('sales')
      .innerJoin('sale_items', 'sale_items.sale_id', 'sales.id')
      .selectAll('sales')
      .where('sale_items.vehicle_id', '=', vehicleId)
      .where('sale_items.status', '=', 'active')
      .where('sales.status', '!=', 'cancelled')
      .where('sales.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row, await this.listItems(row.id));
  }

  async existsByNumber(saleNumber: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('sales')
      .select('id')
      .where('sale_number', '=', saleNumber)
      .executeTakeFirst();

    return row !== undefined;
  }

  /**
   * Mismos predicados que el indice unico parcial `uq_sale_items_vehicle_active`
   * mas el estado de la venta. Si esta comprobacion y el indice se separaran, el
   * dominio dejaria pasar casos que la base rechazaria con un 500.
   */
  async isVehicleSold(vehicleId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('sale_items')
      .innerJoin('sales', 'sales.id', 'sale_items.sale_id')
      .select('sale_items.id')
      .where('sale_items.vehicle_id', '=', vehicleId)
      .where('sale_items.status', '=', 'active')
      .where('sales.status', '!=', 'cancelled')
      .where('sales.deleted_at', 'is', null)
      .executeTakeFirst();

    return row !== undefined;
  }

  async list(filters: SaleFilters, page: PageQuery): Promise<PaginatedResult<SaleWithDetails>> {
    const base = this.applyFilters(this.baseJoin(), filters);

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('sales')
      .select(this.detailColumns())
      .orderBy('sales.sale_date', 'desc')
      .orderBy('sales.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    // Lineas, pagos y reembolsos de la pagina en tres consultas (evita el N+1).
    const children = await this.loadChildren(rows.map((row) => row.id));

    const items = rows.map((row) => this.mapDetail(row, children.get(row.id) ?? NO_CHILDREN));

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async create(data: NewSale): Promise<Sale> {
    const row = await this.db
      .insertInto('sales')
      .values({
        sale_number: data.saleNumber,
        reservation_id: data.reservationId,
        quotation_id: data.quotationId,
        client_id: data.clientId,
        currency_id: data.currencyId,
        exchange_rate: data.exchangeRate,
        sale_date: data.saleDate,
        status: data.status,
        salesperson_id: data.salespersonId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Recien creada: todavia no tiene lineas, el caso de uso las agrega despues.
    return mapSale(row, []);
  }

  async update(id: string, data: SaleUpdate): Promise<Sale | null> {
    const patch = {
      ...(data.exchangeRate !== undefined ? { exchange_rate: data.exchangeRate } : {}),
      ...(data.saleDate !== undefined ? { sale_date: data.saleDate } : {}),
      ...(data.salespersonId !== undefined ? { salesperson_id: data.salespersonId } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('sales')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row, await this.listItems(id));
  }

  async updateStatus(id: string, status: SaleStatus): Promise<Sale | null> {
    const row = await this.db
      .updateTable('sales')
      .set({ status })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row, await this.listItems(id));
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('sales')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async summary(filters: SaleFilters): Promise<SalesSummary> {
    /*
     * Una venta anulada no es facturacion, ni cobro, ni cartera.
     *
     * El resumen alimenta las tarjetas del tablero, que se piden sin filtro de
     * estado. Contando las canceladas, una venta caida seguia sumando su
     * importe a «Ventas registradas» y su saldo a «Saldo por cobrar», y el
     * tablero contradecia al reporte de cuentas por cobrar, cuya vista
     * (`vw_accounts_receivable`) si las excluye: dos pantallas dando cifras
     * distintas del mismo dinero.
     *
     * El filtro explicito manda: quien pide `status=cancelled` quiere verlas.
     */
    const conFiltros = () => {
      const query = this.applyFilters(this.baseJoin(), filters);
      return filters.status === undefined ? query.where('sales.status', '<>', 'cancelled') : query;
    };

    const counts = await conFiltros()
      .select((eb) => eb.fn.countAll<number>().as('total_sales'))
      .executeTakeFirstOrThrow();

    /*
     * Tres consultas separadas y no un solo JOIN con tres agregados: unir
     * `sales` con lineas, cobros y reembolsos a la vez multiplica las filas y
     * cada SUM contaria de mas tantas veces como filas aporten las otras dos.
     */
    const amounts = await conFiltros()
      .innerJoin('sale_items', 'sale_items.sale_id', 'sales.id')
      .where('sale_items.status', '=', 'active')
      .select((eb) => [
        eb.fn.countAll<number>().as('total_vehicles'),
        eb.fn.sum<number>(sql`sale_items.sale_price * sales.exchange_rate`).as('total_amount'),
      ])
      .executeTakeFirst();

    // Cobros y reembolsos se registran siempre en la moneda de la venta (lo
    // garantizan `register-sale-payment` y `register-refund`), asi que ambos se
    // convierten con la tasa de la venta y el neto queda coherente.
    const collected = await conFiltros()
      .innerJoin('sale_payments', 'sale_payments.sale_id', 'sales.id')
      .select((eb) =>
        eb.fn.sum<number>(sql`sale_payments.amount * sales.exchange_rate`).as('total_collected'),
      )
      .executeTakeFirst();

    const refunded = await conFiltros()
      .innerJoin('refunds', 'refunds.sale_id', 'sales.id')
      .select((eb) =>
        eb.fn.sum<number>(sql`refunds.amount * sales.exchange_rate`).as('total_refunded'),
      )
      .executeTakeFirst();

    const totalAmount = round2(toNumber(amounts?.total_amount ?? 0));
    const totalCollected = round2(toNumber(collected?.total_collected ?? 0));
    const totalRefunded = round2(toNumber(refunded?.total_refunded ?? 0));

    return {
      reportingCurrency: REPORTING_CURRENCY_CODE,
      totalSales: Number(counts.total_sales),
      totalVehicles: Number(amounts?.total_vehicles ?? 0),
      totalAmount,
      totalCollected,
      totalRefunded,
      pendingBalance: round2(Math.max(totalAmount - (totalCollected - totalRefunded), 0)),
    };
  }

  async lastNumberForYear(yearPrefix: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('sales')
      .select('sale_number')
      .where('sale_number', 'like', `${yearPrefix}%`)
      .orderBy('sale_number', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row === undefined ? null : row.sale_number;
  }

  // --- Lineas ---------------------------------------------------------------

  async listItems(saleId: string): Promise<SaleItem[]> {
    const rows = await this.db
      .selectFrom('sale_items')
      .selectAll()
      .where('sale_id', '=', saleId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map(mapItem);
  }

  async findItemById(saleItemId: string): Promise<SaleItem | null> {
    const row = await this.db
      .selectFrom('sale_items')
      .selectAll()
      .where('id', '=', saleItemId)
      .executeTakeFirst();

    return row === undefined ? null : mapItem(row);
  }

  async addItem(saleId: string, data: NewSaleItem): Promise<SaleItem> {
    const row = await this.db
      .insertInto('sale_items')
      .values({
        sale_id: saleId,
        vehicle_id: data.vehicleId,
        sale_price: data.salePrice,
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapItem(row);
  }

  async updateItemPrice(saleItemId: string, salePrice: number): Promise<SaleItem | null> {
    const row = await this.db
      .updateTable('sale_items')
      .set({ sale_price: salePrice })
      .where('id', '=', saleItemId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapItem(row);
  }

  async returnItem(saleItemId: string, data: SaleItemReturn): Promise<SaleItem | null> {
    const row = await this.db
      .updateTable('sale_items')
      .set({
        status: 'returned',
        returned_at: data.returnedAt,
        return_reason: data.reason,
      })
      .where('id', '=', saleItemId)
      .where('status', '=', 'active')
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapItem(row);
  }

  async returnAllItems(saleId: string, data: SaleItemReturn): Promise<SaleItem[]> {
    const rows = await this.db
      .updateTable('sale_items')
      .set({
        status: 'returned',
        returned_at: data.returnedAt,
        return_reason: data.reason,
      })
      .where('sale_id', '=', saleId)
      .where('status', '=', 'active')
      .returningAll()
      .execute();

    return rows.map(mapItem);
  }

  /**
   * Borrado FISICO, y es correcto que lo sea: solo se llega aqui corrigiendo una
   * linea agregada por error a una venta todavia en proceso. Una linea que llego
   * a tener efecto —cobrada, facturada o entregada— se devuelve, no se quita.
   */
  async removeItem(saleItemId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('sale_items')
      .where('id', '=', saleItemId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  // --- Pagos ----------------------------------------------------------------

  async listPayments(saleId: string): Promise<SalePaymentWithDetails[]> {
    return (await this.groupPaymentsBySale([saleId])).get(saleId) ?? [];
  }

  async findPaymentById(paymentId: string): Promise<SalePayment | null> {
    const row = await this.db
      .selectFrom('sale_payments')
      .selectAll()
      .where('id', '=', paymentId)
      .executeTakeFirst();

    return row === undefined ? null : mapPayment(row);
  }

  async addPayment(data: NewSalePayment): Promise<SalePayment> {
    const row = await this.db
      .insertInto('sale_payments')
      .values({
        sale_id: data.saleId,
        payment_method_id: data.paymentMethodId,
        currency_id: data.currencyId,
        amount: data.amount,
        payment_date: data.paymentDate,
        reference_number: data.referenceNumber,
        received_by: data.receivedBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapPayment(row);
  }

  async deletePayment(paymentId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('sale_payments')
      .where('id', '=', paymentId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  async totalPaid(saleId: string): Promise<number> {
    const row = await this.db
      .selectFrom('sale_payments')
      .select((eb) => eb.fn.sum<number>('amount').as('total'))
      .where('sale_id', '=', saleId)
      .executeTakeFirst();

    return round2(toNumber(row?.total ?? 0));
  }

  // --- Reembolsos -----------------------------------------------------------

  async listRefunds(saleId: string): Promise<RefundWithDetails[]> {
    return (await this.groupRefundsBySale([saleId])).get(saleId) ?? [];
  }

  async findRefundById(refundId: string): Promise<Refund | null> {
    const row = await this.db
      .selectFrom('refunds')
      .selectAll()
      .where('id', '=', refundId)
      .executeTakeFirst();

    return row === undefined ? null : mapRefund(row);
  }

  async addRefund(data: NewRefund): Promise<Refund> {
    const row = await this.db
      .insertInto('refunds')
      .values({
        sale_id: data.saleId,
        sale_item_id: data.saleItemId,
        refund_method_id: data.refundMethodId,
        currency_id: data.currencyId,
        amount: data.amount,
        exchange_rate: data.exchangeRate,
        refund_date: data.refundDate,
        reason: data.reason,
        processed_by: data.processedBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapRefund(row);
  }

  async totalRefunded(saleId: string): Promise<number> {
    const row = await this.db
      .selectFrom('refunds')
      .select((eb) => eb.fn.sum<number>('amount').as('total'))
      .where('sale_id', '=', saleId)
      .executeTakeFirst();

    return round2(toNumber(row?.total ?? 0));
  }

  async refundedForItem(saleItemId: string): Promise<number> {
    const row = await this.db
      .selectFrom('refunds')
      .select((eb) => eb.fn.sum<number>('amount').as('total'))
      .where('sale_item_id', '=', saleItemId)
      .executeTakeFirst();

    return round2(toNumber(row?.total ?? 0));
  }

  // --- Internos -------------------------------------------------------------

  private baseJoin() {
    return this.db
      .selectFrom('sales')
      .innerJoin('clients', 'clients.id', 'sales.client_id')
      .innerJoin('currencies', 'currencies.id', 'sales.currency_id')
      .innerJoin('users', 'users.id', 'sales.salesperson_id')
      .leftJoin('reservations', 'reservations.id', 'sales.reservation_id')
      .leftJoin('quotations', 'quotations.id', 'sales.quotation_id')
      .where('sales.deleted_at', 'is', null);
  }

  private applyFilters<Q extends ReturnType<KyselySaleRepository['baseJoin']>>(
    query: Q,
    filters: SaleFilters,
  ): Q {
    let result = query;

    /*
     * El chasis ya no cuelga de `sales`: se busca con un EXISTS sobre las
     * lineas. Un JOIN habria duplicado la venta una vez por vehiculo, y con el
     * la paginacion y el total de la lista.
     */
    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      result = result.where((eb) =>
        eb.or([
          eb('sales.sale_number', 'ilike', pattern),
          eb('clients.company_name', 'ilike', pattern),
          eb('clients.first_name', 'ilike', pattern),
          eb('clients.last_name', 'ilike', pattern),
          eb.exists(
            eb
              .selectFrom('sale_items')
              .innerJoin('vehicles', 'vehicles.id', 'sale_items.vehicle_id')
              .select('sale_items.id')
              .whereRef('sale_items.sale_id', '=', 'sales.id')
              .where('vehicles.chassis_number', 'ilike', pattern),
          ),
        ]),
      ) as Q;
    }

    if (filters.clientId !== undefined) {
      result = result.where('sales.client_id', '=', filters.clientId) as Q;
    }
    if (filters.vehicleId !== undefined) {
      const vehicleId = filters.vehicleId;
      result = result.where((eb) =>
        eb.exists(
          eb
            .selectFrom('sale_items')
            .select('sale_items.id')
            .whereRef('sale_items.sale_id', '=', 'sales.id')
            .where('sale_items.vehicle_id', '=', vehicleId),
        ),
      ) as Q;
    }
    if (filters.salespersonId !== undefined) {
      result = result.where('sales.salesperson_id', '=', filters.salespersonId) as Q;
    }
    if (filters.status !== undefined) {
      result = result.where('sales.status', '=', filters.status) as Q;
    }
    if (filters.dateFrom !== undefined) {
      result = result.where('sales.sale_date', '>=', filters.dateFrom) as Q;
    }
    if (filters.dateTo !== undefined) {
      result = result.where('sales.sale_date', '<=', filters.dateTo) as Q;
    }

    return result;
  }

  private detailColumns() {
    return [
      CLIENT_NAME.as('client_name'),
      sql<string>`currencies.code`.as('currency_code'),
      SALESPERSON_NAME.as('salesperson_name'),
      sql<string | null>`reservations.reservation_number`.as('reservation_number'),
      sql<string | null>`quotations.quotation_number`.as('quotation_number'),
    ] as const;
  }

  private detailQuery() {
    return this.baseJoin().selectAll('sales').select(this.detailColumns());
  }

  private mapDetail(row: SaleDetailRow, children: SaleChildren): SaleWithDetails {
    const sale = mapSale(row, children.items);
    const paid = sumPayments(children.payments);
    const refunded = sumRefunds(children.refunds);

    return {
      ...sale,
      clientName: row.client_name,
      currencyCode: row.currency_code.trim(),
      salespersonName: row.salesperson_name,
      reservationNumber: row.reservation_number,
      quotationNumber: row.quotation_number,
      items: children.items,
      payments: children.payments,
      refunds: children.refunds,
      totalPaid: paid,
      totalRefunded: refunded,
      netPaid: round2(paid - refunded),
      pendingBalance: pendingBalance(sale.salePrice, round2(paid - refunded)),
    };
  }

  private async loadChildren(saleIds: string[]): Promise<Map<string, SaleChildren>> {
    const grouped = new Map<string, SaleChildren>();

    if (saleIds.length === 0) {
      return grouped;
    }

    const [items, payments, refunds] = await Promise.all([
      this.groupItemsBySale(saleIds),
      this.groupPaymentsBySale(saleIds),
      this.groupRefundsBySale(saleIds),
    ]);

    for (const saleId of saleIds) {
      grouped.set(saleId, {
        items: items.get(saleId) ?? [],
        payments: payments.get(saleId) ?? [],
        refunds: refunds.get(saleId) ?? [],
      });
    }

    return grouped;
  }

  private async groupItemsBySale(saleIds: string[]): Promise<Map<string, SaleItemWithDetails[]>> {
    const grouped = new Map<string, SaleItemWithDetails[]>();

    const rows = await this.db
      .selectFrom('sale_items')
      .innerJoin('vehicles', 'vehicles.id', 'sale_items.vehicle_id')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
      .selectAll('sale_items')
      .select([
        'vehicles.chassis_number as chassis_number',
        'vehicle_brands.name as brand_name',
        'vehicle_models.name as model_name',
        'vehicles.year as vehicle_year',
      ])
      .where('sale_items.sale_id', 'in', saleIds)
      .orderBy('sale_items.created_at', 'asc')
      .execute();

    for (const row of rows) {
      const bucket = grouped.get(row.sale_id) ?? [];
      bucket.push({
        ...mapItem(row),
        vehicleChassisNumber: row.chassis_number,
        vehicleBrandName: row.brand_name,
        vehicleModelName: row.model_name,
        vehicleYear: row.vehicle_year,
      });
      grouped.set(row.sale_id, bucket);
    }

    return grouped;
  }

  private async groupPaymentsBySale(
    saleIds: string[],
  ): Promise<Map<string, SalePaymentWithDetails[]>> {
    const grouped = new Map<string, SalePaymentWithDetails[]>();

    if (saleIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .selectFrom('sale_payments')
      .innerJoin('payment_methods', 'payment_methods.id', 'sale_payments.payment_method_id')
      .innerJoin('currencies', 'currencies.id', 'sale_payments.currency_id')
      .innerJoin('users', 'users.id', 'sale_payments.received_by')
      .selectAll('sale_payments')
      .select([
        'payment_methods.name as payment_method_name',
        'currencies.code as currency_code',
        sql<string>`users.first_name || ' ' || users.last_name`.as('received_by_name'),
      ])
      .where('sale_payments.sale_id', 'in', saleIds)
      .orderBy('sale_payments.payment_date', 'asc')
      .orderBy('sale_payments.created_at', 'asc')
      .execute();

    for (const row of rows) {
      const bucket = grouped.get(row.sale_id) ?? [];
      bucket.push({
        ...mapPayment(row),
        paymentMethodName: row.payment_method_name,
        currencyCode: row.currency_code.trim(),
        receivedByName: row.received_by_name,
      });
      grouped.set(row.sale_id, bucket);
    }

    return grouped;
  }

  private async groupRefundsBySale(saleIds: string[]): Promise<Map<string, RefundWithDetails[]>> {
    const grouped = new Map<string, RefundWithDetails[]>();

    if (saleIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .selectFrom('refunds')
      .innerJoin('payment_methods', 'payment_methods.id', 'refunds.refund_method_id')
      .innerJoin('currencies', 'currencies.id', 'refunds.currency_id')
      .innerJoin('users', 'users.id', 'refunds.processed_by')
      // LEFT: un reembolso general no apunta a ninguna linea.
      .leftJoin('sale_items', 'sale_items.id', 'refunds.sale_item_id')
      .leftJoin('vehicles', 'vehicles.id', 'sale_items.vehicle_id')
      .selectAll('refunds')
      .select([
        'payment_methods.name as refund_method_name',
        'currencies.code as currency_code',
        sql<string>`users.first_name || ' ' || users.last_name`.as('processed_by_name'),
        sql<string | null>`vehicles.chassis_number`.as('chassis_number'),
      ])
      .where('refunds.sale_id', 'in', saleIds)
      .orderBy('refunds.refund_date', 'asc')
      .orderBy('refunds.created_at', 'asc')
      .execute();

    for (const row of rows) {
      const bucket = grouped.get(row.sale_id) ?? [];
      bucket.push({
        ...mapRefund(row),
        refundMethodName: row.refund_method_name,
        currencyCode: row.currency_code.trim(),
        processedByName: row.processed_by_name,
        vehicleChassisNumber: row.chassis_number,
      });
      grouped.set(row.sale_id, bucket);
    }

    return grouped;
  }
}
