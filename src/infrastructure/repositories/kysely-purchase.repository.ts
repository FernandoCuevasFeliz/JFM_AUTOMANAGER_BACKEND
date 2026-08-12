import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  type NewPurchase,
  type NewPurchaseItem,
  type Purchase,
  type PurchaseItem,
  type PurchaseItemWithVehicle,
  type PurchaseStatus,
  type PurchaseUpdate,
  type PurchaseWithDetails,
  purchaseTotalCost,
} from '../../domain/purchases/purchase.entity';
import type {
  PurchaseFilters,
  PurchaseRepository,
} from '../../domain/purchases/purchase.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type { PurchaseItemsTable, PurchasesTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate, toNumber } from './mappers';

function mapPurchase(row: Selectable<PurchasesTable>): Purchase {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    currencyId: row.currency_id,
    purchaseNumber: row.purchase_number,
    invoiceNumber: row.invoice_number,
    purchaseDate: row.purchase_date,
    exchangeRate: toNumber(row.exchange_rate),
    status: row.status,
    createdBy: row.created_by,
    notes: row.notes,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

function mapItem(row: Selectable<PurchaseItemsTable>): PurchaseItem {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    vehicleId: row.vehicle_id,
    unitCost: toNumber(row.unit_cost),
    freightCost: toNumber(row.freight_cost),
    insuranceCost: toNumber(row.insurance_cost),
    otherCosts: toNumber(row.other_costs),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class KyselyPurchaseRepository implements PurchaseRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Purchase | null> {
    const row = await this.db
      .selectFrom('purchases')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapPurchase(row);
  }

  async findByIdWithDetails(id: string): Promise<PurchaseWithDetails | null> {
    const row = await this.db
      .selectFrom('purchases')
      .innerJoin('suppliers', 'suppliers.id', 'purchases.supplier_id')
      .innerJoin('currencies', 'currencies.id', 'purchases.currency_id')
      .innerJoin('users', 'users.id', 'purchases.created_by')
      .selectAll('purchases')
      .select([
        'suppliers.name as supplier_name',
        'currencies.code as currency_code',
        sql<string>`users.first_name || ' ' || users.last_name`.as('created_by_name'),
      ])
      .where('purchases.id', '=', id)
      .where('purchases.deleted_at', 'is', null)
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    const items = await this.listItemsWithVehicle(id);

    return {
      ...mapPurchase(row),
      supplierName: row.supplier_name,
      currencyCode: row.currency_code.trim(),
      createdByName: row.created_by_name,
      items,
      totalCost: purchaseTotalCost(items),
    };
  }

  async existsByPurchaseNumber(
    purchaseNumber: string,
    excludePurchaseId?: string,
  ): Promise<boolean> {
    let query = this.db
      .selectFrom('purchases')
      .select('id')
      .where('purchase_number', '=', purchaseNumber);

    if (excludePurchaseId !== undefined) {
      query = query.where('id', '!=', excludePurchaseId);
    }

    return (await query.executeTakeFirst()) !== undefined;
  }

  async list(
    filters: PurchaseFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<PurchaseWithDetails>> {
    let base = this.db
      .selectFrom('purchases')
      .innerJoin('suppliers', 'suppliers.id', 'purchases.supplier_id')
      .innerJoin('currencies', 'currencies.id', 'purchases.currency_id')
      .innerJoin('users', 'users.id', 'purchases.created_by')
      .where('purchases.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('purchases.purchase_number', 'ilike', pattern),
          eb('purchases.invoice_number', 'ilike', pattern),
          eb('suppliers.name', 'ilike', pattern),
        ]),
      );
    }

    if (filters.supplierId !== undefined) {
      base = base.where('purchases.supplier_id', '=', filters.supplierId);
    }
    if (filters.status !== undefined) {
      base = base.where('purchases.status', '=', filters.status);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('purchases.purchase_date', '>=', filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      base = base.where('purchases.purchase_date', '<=', filters.dateTo);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('purchases')
      .select([
        'suppliers.name as supplier_name',
        'currencies.code as currency_code',
        sql<string>`users.first_name || ' ' || users.last_name`.as('created_by_name'),
      ])
      .orderBy('purchases.purchase_date', 'desc')
      .orderBy('purchases.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    const purchaseIds = rows.map((row) => row.id);
    const itemsByPurchase = await this.groupItemsByPurchase(purchaseIds);

    const items = rows.map((row) => {
      const purchaseItems = itemsByPurchase.get(row.id) ?? [];
      return {
        ...mapPurchase(row),
        supplierName: row.supplier_name,
        currencyCode: row.currency_code.trim(),
        createdByName: row.created_by_name,
        items: purchaseItems,
        totalCost: purchaseTotalCost(purchaseItems),
      };
    });

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async create(data: NewPurchase): Promise<Purchase> {
    const row = await this.db
      .insertInto('purchases')
      .values({
        supplier_id: data.supplierId,
        currency_id: data.currencyId,
        purchase_number: data.purchaseNumber,
        invoice_number: data.invoiceNumber,
        purchase_date: data.purchaseDate,
        exchange_rate: data.exchangeRate,
        status: data.status,
        created_by: data.createdBy,
        notes: data.notes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapPurchase(row);
  }

  async update(id: string, data: PurchaseUpdate): Promise<Purchase | null> {
    const patch = {
      ...(data.supplierId !== undefined ? { supplier_id: data.supplierId } : {}),
      ...(data.currencyId !== undefined ? { currency_id: data.currencyId } : {}),
      ...(data.invoiceNumber !== undefined ? { invoice_number: data.invoiceNumber } : {}),
      ...(data.purchaseDate !== undefined ? { purchase_date: data.purchaseDate } : {}),
      ...(data.exchangeRate !== undefined ? { exchange_rate: data.exchangeRate } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('purchases')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapPurchase(row);
  }

  async updateStatus(id: string, status: PurchaseStatus): Promise<Purchase | null> {
    const row = await this.db
      .updateTable('purchases')
      .set({ status })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapPurchase(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('purchases')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async listItems(purchaseId: string): Promise<PurchaseItem[]> {
    const rows = await this.db
      .selectFrom('purchase_items')
      .selectAll()
      .where('purchase_id', '=', purchaseId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map(mapItem);
  }

  async findItemById(itemId: string): Promise<PurchaseItem | null> {
    const row = await this.db
      .selectFrom('purchase_items')
      .selectAll()
      .where('id', '=', itemId)
      .executeTakeFirst();

    return row === undefined ? null : mapItem(row);
  }

  async addItem(purchaseId: string, item: NewPurchaseItem): Promise<PurchaseItem> {
    const row = await this.db
      .insertInto('purchase_items')
      .values({
        purchase_id: purchaseId,
        vehicle_id: item.vehicleId,
        unit_cost: item.unitCost,
        freight_cost: item.freightCost,
        insurance_cost: item.insuranceCost,
        other_costs: item.otherCosts,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapItem(row);
  }

  async removeItem(itemId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('purchase_items')
      .where('id', '=', itemId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  async isVehiclePurchased(vehicleId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('purchase_items')
      .select('id')
      .where('vehicle_id', '=', vehicleId)
      .executeTakeFirst();

    return row !== undefined;
  }

  async listVehicleIds(purchaseId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('purchase_items')
      .select('vehicle_id')
      .where('purchase_id', '=', purchaseId)
      .execute();

    return rows.map((row) => row.vehicle_id);
  }

  async findItemByVehicleId(vehicleId: string): Promise<PurchaseItem | null> {
    const row = await this.db
      .selectFrom('purchase_items')
      .selectAll()
      .where('vehicle_id', '=', vehicleId)
      .executeTakeFirst();

    return row === undefined ? null : mapItem(row);
  }

  async lastNumberForYear(yearPrefix: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('purchases')
      .select('purchase_number')
      .where('purchase_number', 'like', `${yearPrefix}%`)
      .orderBy('purchase_number', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row === undefined ? null : row.purchase_number;
  }

  private async listItemsWithVehicle(purchaseId: string): Promise<PurchaseItemWithVehicle[]> {
    const grouped = await this.groupItemsByPurchase([purchaseId]);
    return grouped.get(purchaseId) ?? [];
  }

  private async groupItemsByPurchase(
    purchaseIds: string[],
  ): Promise<Map<string, PurchaseItemWithVehicle[]>> {
    const grouped = new Map<string, PurchaseItemWithVehicle[]>();

    if (purchaseIds.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .selectFrom('purchase_items')
      .innerJoin('vehicles', 'vehicles.id', 'purchase_items.vehicle_id')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
      .selectAll('purchase_items')
      .select([
        'vehicles.chassis_number',
        'vehicles.year',
        'vehicle_brands.name as brand_name',
        'vehicle_models.name as model_name',
      ])
      .where('purchase_items.purchase_id', 'in', purchaseIds)
      .orderBy('purchase_items.created_at', 'asc')
      .execute();

    for (const row of rows) {
      const bucket = grouped.get(row.purchase_id) ?? [];
      bucket.push({
        ...mapItem(row),
        chassisNumber: row.chassis_number,
        brandName: row.brand_name,
        modelName: row.model_name,
        year: row.year,
      });
      grouped.set(row.purchase_id, bucket);
    }

    return grouped;
  }
}
