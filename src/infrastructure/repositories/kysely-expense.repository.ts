import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type {
  Expense,
  ExpenseUpdate,
  ExpenseWithDetails,
  NewExpense,
  VehicleCostSummary,
} from '../../domain/expenses/expense.entity';
import type { ExpenseFilters, ExpenseRepository } from '../../domain/expenses/expense.repository';
import { REPORTING_CURRENCY_CODE, toReportingCurrency } from '../../domain/shared/money';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type { ExpensesTable } from '../database/database.types';
import {
  isEmptyPatch,
  likePattern,
  round2,
  toDate,
  toNullableDate,
  toNullableNumber,
  toNumber,
} from './mappers';

function mapExpense(row: Selectable<ExpensesTable>): Expense {
  return {
    id: row.id,
    categoryId: row.category_id,
    vehicleId: row.vehicle_id,
    currencyId: row.currency_id,
    paymentMethodId: row.payment_method_id,
    description: row.description,
    amount: toNumber(row.amount),
    exchangeRate: toNumber(row.exchange_rate),
    expenseDate: row.expense_date,
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

export class KyselyExpenseRepository implements ExpenseRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Expense | null> {
    const row = await this.db
      .selectFrom('expenses')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapExpense(row);
  }

  async findByIdWithDetails(id: string): Promise<ExpenseWithDetails | null> {
    const row = await this.detailQuery()
      .where('expenses.id', '=', id)
      .where('expenses.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : this.mapDetail(row);
  }

  async list(
    filters: ExpenseFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ExpenseWithDetails>> {
    let base = this.db
      .selectFrom('expenses')
      .innerJoin('expense_categories', 'expense_categories.id', 'expenses.category_id')
      .innerJoin('currencies', 'currencies.id', 'expenses.currency_id')
      .innerJoin('payment_methods', 'payment_methods.id', 'expenses.payment_method_id')
      .innerJoin('users', 'users.id', 'expenses.created_by')
      .leftJoin('vehicles', 'vehicles.id', 'expenses.vehicle_id')
      .where('expenses.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('expenses.description', 'ilike', pattern),
          eb('expense_categories.name', 'ilike', pattern),
          eb('vehicles.chassis_number', 'ilike', pattern),
        ]),
      );
    }

    if (filters.categoryId !== undefined) {
      base = base.where('expenses.category_id', '=', filters.categoryId);
    }
    if (filters.vehicleId !== undefined) {
      base = base.where('expenses.vehicle_id', '=', filters.vehicleId);
    }
    if (filters.generalOnly === true) {
      base = base.where('expenses.vehicle_id', 'is', null);
    } else if (filters.generalOnly === false) {
      base = base.where('expenses.vehicle_id', 'is not', null);
    }
    if (filters.paymentMethodId !== undefined) {
      base = base.where('expenses.payment_method_id', '=', filters.paymentMethodId);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('expenses.expense_date', '>=', filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      base = base.where('expenses.expense_date', '<=', filters.dateTo);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('expenses')
      .select([
        'expense_categories.name as category_name',
        'expense_categories.scope as category_scope',
        'currencies.code as currency_code',
        'payment_methods.name as payment_method_name',
        'vehicles.chassis_number as vehicle_chassis_number',
        sql<string>`users.first_name || ' ' || users.last_name`.as('created_by_name'),
      ])
      .orderBy('expenses.expense_date', 'desc')
      .orderBy('expenses.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    return buildPaginatedResult(
      rows.map((row) => this.mapDetail(row)),
      Number(totalRow.total),
      page,
    );
  }

  async create(data: NewExpense): Promise<Expense> {
    const row = await this.db
      .insertInto('expenses')
      .values({
        category_id: data.categoryId,
        vehicle_id: data.vehicleId,
        currency_id: data.currencyId,
        payment_method_id: data.paymentMethodId,
        description: data.description,
        amount: data.amount,
        exchange_rate: data.exchangeRate,
        expense_date: data.expenseDate,
        created_by: data.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapExpense(row);
  }

  async update(id: string, data: ExpenseUpdate): Promise<Expense | null> {
    const patch = {
      ...(data.categoryId !== undefined ? { category_id: data.categoryId } : {}),
      ...(data.vehicleId !== undefined ? { vehicle_id: data.vehicleId } : {}),
      ...(data.currencyId !== undefined ? { currency_id: data.currencyId } : {}),
      ...(data.paymentMethodId !== undefined ? { payment_method_id: data.paymentMethodId } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.exchangeRate !== undefined ? { exchange_rate: data.exchangeRate } : {}),
      ...(data.expenseDate !== undefined ? { expense_date: data.expenseDate } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('expenses')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapExpense(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('expenses')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  /** Total de gastos del vehiculo ya convertido a la moneda de reporte. */
  async sumByVehicle(vehicleId: string): Promise<number> {
    const row = await this.db
      .selectFrom('expenses')
      .select((eb) => eb.fn.sum<number>(sql`amount * exchange_rate`).as('total'))
      .where('vehicle_id', '=', vehicleId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return round2(toNumber(row?.total ?? 0));
  }

  /**
   * Costo real de la unidad. Cruza tres fuentes:
   *   - `purchase_items`: lo que costo traerla (compra, flete, seguro, aduana),
   *     en la moneda de la compra.
   *   - `expenses`: todo lo gastado en ella despues (taller, placas, etc.),
   *     posiblemente en varias monedas.
   *   - `sales`: a cuanto se vendio realmente, si ya se vendio.
   *
   * Cada importe se lleva a la moneda de reporte con la tasa registrada EN SU
   * PROPIO DOCUMENTO (ver `domain/shared/money.ts`), que es lo que permite
   * sumar una compra en dolares con gastos en pesos y obtener un costo real
   * comparable con el precio de venta.
   */
  async vehicleCostSummary(vehicleId: string): Promise<VehicleCostSummary | null> {
    const vehicle = await this.db
      .selectFrom('vehicles')
      .select(['id', 'sale_price'])
      .where('id', '=', vehicleId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (vehicle === undefined) {
      return null;
    }

    // La tasa y la moneda del item de compra viven en el encabezado.
    const purchaseItem = await this.db
      .selectFrom('purchase_items')
      .innerJoin('purchases', 'purchases.id', 'purchase_items.purchase_id')
      .innerJoin('currencies', 'currencies.id', 'purchases.currency_id')
      .select([
        'purchase_items.unit_cost',
        'purchase_items.freight_cost',
        'purchase_items.insurance_cost',
        'purchase_items.other_costs',
        'purchases.exchange_rate',
        'currencies.code as currency_code',
      ])
      .where('purchase_items.vehicle_id', '=', vehicleId)
      .where('purchases.deleted_at', 'is', null)
      .executeTakeFirst();

    const expenseRows = await this.db
      .selectFrom('expenses')
      .innerJoin('currencies', 'currencies.id', 'expenses.currency_id')
      .select((eb) => [
        'currencies.code as currency_code',
        eb.fn.sum<number>('expenses.amount').as('total'),
        eb.fn.sum<number>(sql`expenses.amount * expenses.exchange_rate`).as('total_converted'),
      ])
      .where('expenses.vehicle_id', '=', vehicleId)
      .where('expenses.deleted_at', 'is', null)
      .groupBy('currencies.code')
      .orderBy('currencies.code', 'asc')
      .execute();

    const sale = await this.db
      .selectFrom('sales')
      .innerJoin('currencies', 'currencies.id', 'sales.currency_id')
      .select(['sales.sale_price', 'sales.exchange_rate', 'currencies.code as currency_code'])
      .where('sales.vehicle_id', '=', vehicleId)
      .where('sales.status', '!=', 'cancelled')
      .where('sales.deleted_at', 'is', null)
      .executeTakeFirst();

    const purchaseCost = toNumber(purchaseItem?.unit_cost ?? 0);
    const freightCost = toNumber(purchaseItem?.freight_cost ?? 0);
    const insuranceCost = toNumber(purchaseItem?.insurance_cost ?? 0);
    const otherPurchaseCosts = toNumber(purchaseItem?.other_costs ?? 0);
    const purchaseExchangeRate =
      purchaseItem === undefined ? null : toNumber(purchaseItem.exchange_rate);

    const importSubtotal = round2(
      purchaseCost + freightCost + insuranceCost + otherPurchaseCosts,
    );
    const importSubtotalConverted = toReportingCurrency(
      importSubtotal,
      purchaseExchangeRate ?? 1,
    );

    const expensesByCurrency = expenseRows.map((row) => ({
      currencyCode: row.currency_code.trim(),
      total: round2(toNumber(row.total)),
      totalConverted: round2(toNumber(row.total_converted)),
    }));

    const expensesTotalConverted = round2(
      expensesByCurrency.reduce((sum, entry) => sum + entry.totalConverted, 0),
    );

    const totalCostConverted = round2(importSubtotalConverted + expensesTotalConverted);

    const soldPrice = sale === undefined ? null : toNumber(sale.sale_price);
    const soldPriceConverted =
      sale === undefined ? null : toReportingCurrency(soldPrice ?? 0, toNumber(sale.exchange_rate));

    const margin =
      soldPriceConverted === null ? null : round2(soldPriceConverted - totalCostConverted);
    const marginPercentage =
      margin === null || totalCostConverted === 0
        ? null
        : round2((margin / totalCostConverted) * 100);

    return {
      vehicleId,
      reportingCurrency: REPORTING_CURRENCY_CODE,
      purchaseCurrencyCode: purchaseItem?.currency_code.trim() ?? null,
      purchaseExchangeRate,
      purchaseCost,
      freightCost,
      insuranceCost,
      otherPurchaseCosts,
      importSubtotal,
      importSubtotalConverted,
      expensesByCurrency,
      expensesTotalConverted,
      totalCostConverted,
      listPrice: toNullableNumber(vehicle.sale_price),
      saleCurrencyCode: sale?.currency_code.trim() ?? null,
      soldPrice,
      soldPriceConverted,
      margin,
      marginPercentage,
    };
  }

  private detailQuery() {
    return this.db
      .selectFrom('expenses')
      .innerJoin('expense_categories', 'expense_categories.id', 'expenses.category_id')
      .innerJoin('currencies', 'currencies.id', 'expenses.currency_id')
      .innerJoin('payment_methods', 'payment_methods.id', 'expenses.payment_method_id')
      .innerJoin('users', 'users.id', 'expenses.created_by')
      .leftJoin('vehicles', 'vehicles.id', 'expenses.vehicle_id')
      .selectAll('expenses')
      .select([
        'expense_categories.name as category_name',
        'expense_categories.scope as category_scope',
        'currencies.code as currency_code',
        'payment_methods.name as payment_method_name',
        'vehicles.chassis_number as vehicle_chassis_number',
        sql<string>`users.first_name || ' ' || users.last_name`.as('created_by_name'),
      ]);
  }

  private mapDetail(
    row: Selectable<ExpensesTable> & {
      category_name: string;
      category_scope: 'general' | 'vehicle';
      currency_code: string;
      payment_method_name: string;
      vehicle_chassis_number: string | null;
      created_by_name: string;
    },
  ): ExpenseWithDetails {
    return {
      ...mapExpense(row),
      categoryName: row.category_name,
      categoryScope: row.category_scope,
      currencyCode: row.currency_code.trim(),
      paymentMethodName: row.payment_method_name,
      vehicleChassisNumber: row.vehicle_chassis_number,
      createdByName: row.created_by_name,
    };
  }
}
