import type { Selectable } from 'kysely';
import type {
  VehicleBrand,
  VehicleCatalogRepository,
  VehicleModel,
  VehicleModelWithBrand,
} from '../../domain/vehicles/vehicle-catalog.repository';
import type { Executor } from '../database/connection';
import type { VehicleBrandsTable, VehicleModelsTable } from '../database/database.types';
import { isEmptyPatch, toDate } from './mappers';

function mapBrand(row: Selectable<VehicleBrandsTable>): VehicleBrand {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapModel(row: Selectable<VehicleModelsTable>): VehicleModel {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class KyselyVehicleCatalogRepository implements VehicleCatalogRepository {
  constructor(private readonly db: Executor) {}

  async findBrandById(id: string): Promise<VehicleBrand | null> {
    const row = await this.db
      .selectFrom('vehicle_brands')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : mapBrand(row);
  }

  async findBrandByName(name: string): Promise<VehicleBrand | null> {
    const row = await this.db
      .selectFrom('vehicle_brands')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();
    return row === undefined ? null : mapBrand(row);
  }

  async listBrands(onlyActive: boolean): Promise<VehicleBrand[]> {
    let query = this.db.selectFrom('vehicle_brands').selectAll().orderBy('name', 'asc');
    if (onlyActive) {
      query = query.where('is_active', '=', true);
    }
    return (await query.execute()).map(mapBrand);
  }

  async createBrand(name: string): Promise<VehicleBrand> {
    const row = await this.db
      .insertInto('vehicle_brands')
      .values({ name })
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapBrand(row);
  }

  async updateBrand(
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<VehicleBrand | null> {
    const patch = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findBrandById(id);
    }

    const row = await this.db
      .updateTable('vehicle_brands')
      .set(patch)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapBrand(row);
  }

  async findModelById(id: string): Promise<VehicleModel | null> {
    const row = await this.db
      .selectFrom('vehicle_models')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : mapModel(row);
  }

  async findModelByBrandAndName(brandId: string, name: string): Promise<VehicleModel | null> {
    const row = await this.db
      .selectFrom('vehicle_models')
      .selectAll()
      .where('brand_id', '=', brandId)
      .where('name', '=', name)
      .executeTakeFirst();
    return row === undefined ? null : mapModel(row);
  }

  async listModels(filters: {
    brandId?: string;
    onlyActive: boolean;
  }): Promise<VehicleModelWithBrand[]> {
    let query = this.db
      .selectFrom('vehicle_models')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicle_models.brand_id')
      .selectAll('vehicle_models')
      .select('vehicle_brands.name as brand_name')
      .orderBy('vehicle_brands.name', 'asc')
      .orderBy('vehicle_models.name', 'asc');

    if (filters.brandId !== undefined) {
      query = query.where('vehicle_models.brand_id', '=', filters.brandId);
    }
    if (filters.onlyActive) {
      query = query.where('vehicle_models.is_active', '=', true);
    }

    return (await query.execute()).map((row) => ({ ...mapModel(row), brandName: row.brand_name }));
  }

  async createModel(brandId: string, name: string): Promise<VehicleModel> {
    const row = await this.db
      .insertInto('vehicle_models')
      .values({ brand_id: brandId, name })
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapModel(row);
  }

  async updateModel(
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<VehicleModel | null> {
    const patch = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findModelById(id);
    }

    const row = await this.db
      .updateTable('vehicle_models')
      .set(patch)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapModel(row);
  }
}
