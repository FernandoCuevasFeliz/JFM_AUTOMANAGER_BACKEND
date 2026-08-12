import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  type NewSale,
  type NewSalePayment,
  pendingBalance,
  type Sale,
  type SalePayment,
  type SalePaymentWithDetails,
  type SaleStatus,
  type SaleUpdate,
  type SaleWithDetails,
  totalPaid as sumPayments,
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
import type { SalePaymentsTable, SalesTable } from '../database/database.types';
import { isEmptyPatch, likePattern, round2, toDate, toNullableDate, toNumber } from './mappers';

const CLIENT_NAME = sql<string>`coalesce(clients.company_name, clients.first_name || ' ' || clients.last_name)`;
const SALESPERSON_NAME = sql<string>`users.first_name || ' ' || users.last_name`;

function mapSale(row: Selectable<SalesTable>): Sale {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    reservationId: row.reservation_id,
    quotationId: row.quotation_id,
    clientId: row.client_id,
    vehicleId: row.vehicle_id,
    currencyId: row.currency_id,
    salePrice: toNumber(row.sale_price),
    exchangeRate: toNumber(row.exchange_rate),
    saleDate: row.sale_date,
    status: row.status,
    salespersonId: row.salesperson_id,
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

type SaleDetailRow = Selectable<SalesTable> & {
  client_name: string;
  chassis_number: string;
  brand_name: string;
  model_name: string;
  vehicle_year: number;
  currency_code: string;
  salesperson_name: string;
  reservation_number: string | null;
  quotation_number: string | null;
};

export class KyselySaleRepository implements SaleRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Sale | null> {
    const row = await this.db
      .selectFrom('sales')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row);
  }

  async findByIdWithDetails(id: string): Promise<SaleWithDetails | null> {
    const row = await this.detailQuery()
      .where('sales.id', '=', id)
      .where('sales.deleted_at', 'is', null)
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    const payments = await this.listPayments(id);
    return this.mapDetail(row, payments);
  }

  async findByVehicleId(vehicleId: string): Promise<Sale | null> {
    const row = await this.db
      .selectFrom('sales')
      .selectAll()
      .where('vehicle_id', '=', vehicleId)
      .where('status', '!=', 'cancelled')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row);
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
   * Mismos predicados que el indice unico parcial `uq_sales_vehicle_active`:
   * una venta cancelada o borrada logicamente no bloquea una venta nueva.
   * Si esta comprobacion y el indice se separaran, el dominio dejaria pasar
   * casos que la base rechazaria con un 500.
   */
  async isVehicleSold(vehicleId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('sales')
      .select('id')
      .where('vehicle_id', '=', vehicleId)
      .where('status', '!=', 'cancelled')
      .where('deleted_at', 'is', null)
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

    // Todos los pagos de la pagina en una consulta (evita el N+1).
    const saleIds = rows.map((row) => row.id);
    const paymentsBySale = await this.groupPaymentsBySale(saleIds);

    const items = rows.map((row) => this.mapDetail(row, paymentsBySale.get(row.id) ?? []));

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
        vehicle_id: data.vehicleId,
        currency_id: data.currencyId,
        sale_price: data.salePrice,
        exchange_rate: data.exchangeRate,
        sale_date: data.saleDate,
        status: data.status,
        salesperson_id: data.salespersonId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapSale(row);
  }

  async update(id: string, data: SaleUpdate): Promise<Sale | null> {
    const patch = {
      ...(data.salePrice !== undefined ? { sale_price: data.salePrice } : {}),
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

    return row === undefined ? null : mapSale(row);
  }

  async updateStatus(id: string, status: SaleStatus): Promise<Sale | null> {
    const row = await this.db
      .updateTable('sales')
      .set({ status })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapSale(row);
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
    const base = this.applyFilters(this.baseJoin(), filters);

    const totals = await base
      .select((eb) => [
        eb.fn.countAll<number>().as('total_sales'),
        eb.fn.sum<number>(sql`sales.sale_price * sales.exchange_rate`).as('total_amount'),
      ])
      .executeTakeFirstOrThrow();

    // El abono se registra siempre en la moneda de la venta (lo garantiza
    // `register-sale-payment`), asi que se convierte con la tasa de la venta.
    const collected = await this.applyFilters(this.baseJoin(), filters)
      .innerJoin('sale_payments', 'sale_payments.sale_id', 'sales.id')
      .select((eb) =>
        eb.fn
          .sum<number>(sql`sale_payments.amount * sales.exchange_rate`)
          .as('total_collected'),
      )
      .executeTakeFirst();

    const totalAmount = round2(toNumber(totals.total_amount ?? 0));
    const totalCollected = round2(toNumber(collected?.total_collected ?? 0));

    return {
      reportingCurrency: REPORTING_CURRENCY_CODE,
      totalSales: Number(totals.total_sales),
      totalAmount,
      totalCollected,
      pendingBalance: round2(Math.max(totalAmount - totalCollected, 0)),
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

  private baseJoin() {
    return this.db
      .selectFrom('sales')
      .innerJoin('clients', 'clients.id', 'sales.client_id')
      .innerJoin('vehicles', 'vehicles.id', 'sales.vehicle_id')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
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

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      result = result.where((eb) =>
        eb.or([
          eb('sales.sale_number', 'ilike', pattern),
          eb('vehicles.chassis_number', 'ilike', pattern),
          eb('clients.company_name', 'ilike', pattern),
          eb('clients.first_name', 'ilike', pattern),
          eb('clients.last_name', 'ilike', pattern),
        ]),
      ) as Q;
    }

    if (filters.clientId !== undefined) {
      result = result.where('sales.client_id', '=', filters.clientId) as Q;
    }
    if (filters.vehicleId !== undefined) {
      result = result.where('sales.vehicle_id', '=', filters.vehicleId) as Q;
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
      sql<string>`vehicles.chassis_number`.as('chassis_number'),
      sql<string>`vehicle_brands.name`.as('brand_name'),
      sql<string>`vehicle_models.name`.as('model_name'),
      sql<number>`vehicles.year`.as('vehicle_year'),
      sql<string>`currencies.code`.as('currency_code'),
      SALESPERSON_NAME.as('salesperson_name'),
      sql<string | null>`reservations.reservation_number`.as('reservation_number'),
      sql<string | null>`quotations.quotation_number`.as('quotation_number'),
    ] as const;
  }

  private detailQuery() {
    return this.baseJoin().selectAll('sales').select(this.detailColumns());
  }

  private mapDetail(row: SaleDetailRow, payments: SalePaymentWithDetails[]): SaleWithDetails {
    const sale = mapSale(row);
    const paid = sumPayments(payments);

    return {
      ...sale,
      clientName: row.client_name,
      vehicleChassisNumber: row.chassis_number,
      vehicleBrandName: row.brand_name,
      vehicleModelName: row.model_name,
      vehicleYear: row.vehicle_year,
      currencyCode: row.currency_code.trim(),
      salespersonName: row.salesperson_name,
      reservationNumber: row.reservation_number,
      quotationNumber: row.quotation_number,
      payments,
      totalPaid: paid,
      pendingBalance: pendingBalance(sale.salePrice, paid),
    };
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
}
