import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import {
  type NewVehicle,
  VEHICLE_STATUSES,
  type Vehicle,
  type VehicleImage,
  type VehicleStatus,
  type VehicleUpdate,
  type VehicleWithDetails,
} from '../../domain/vehicles/vehicle.entity';
import type { VehicleFilters, VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { Executor } from '../database/connection';
import type { VehicleImagesTable, VehiclesTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate, toNullableNumber } from './mappers';

type VehicleRow = Selectable<VehiclesTable>;
type VehicleImageRow = Selectable<VehicleImagesTable>;

function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    brandId: row.brand_id,
    modelId: row.model_id,
    year: row.year,
    chassisNumber: row.chassis_number,
    color: row.color,
    mileage: row.mileage,
    engineNumber: row.engine_number,
    transmissionType: row.transmission_type,
    fuelType: row.fuel_type,
    salePrice: toNullableNumber(row.sale_price),
    status: row.status,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

function mapImage(row: VehicleImageRow): VehicleImage {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    url: row.url,
    isPrimary: row.is_primary,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class KyselyVehicleRepository implements VehicleRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Vehicle | null> {
    const row = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapVehicle(row);
  }

  async findByIdWithDetails(id: string): Promise<VehicleWithDetails | null> {
    const row = await this.db
      .selectFrom('vehicles')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
      .selectAll('vehicles')
      .select(['vehicle_brands.name as brand_name', 'vehicle_models.name as model_name'])
      .where('vehicles.id', '=', id)
      .where('vehicles.deleted_at', 'is', null)
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    const images = await this.listImages(id);

    return {
      ...mapVehicle(row),
      brandName: row.brand_name,
      modelName: row.model_name,
      images,
    };
  }

  async findByChassisNumber(chassisNumber: string): Promise<Vehicle | null> {
    const row = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('chassis_number', '=', chassisNumber)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapVehicle(row);
  }

  async existsByChassisNumber(chassisNumber: string, excludeVehicleId?: string): Promise<boolean> {
    // Sin filtro de `deleted_at`: el UNIQUE de la base tampoco lo tiene, asi que
    // un chasis usado por un vehiculo borrado logicamente sigue ocupado.
    let query = this.db
      .selectFrom('vehicles')
      .select('id')
      .where('chassis_number', '=', chassisNumber);

    if (excludeVehicleId !== undefined) {
      query = query.where('id', '!=', excludeVehicleId);
    }

    return (await query.executeTakeFirst()) !== undefined;
  }

  async list(
    filters: VehicleFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<VehicleWithDetails>> {
    let base = this.db
      .selectFrom('vehicles')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
      .where('vehicles.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('vehicles.chassis_number', 'ilike', pattern),
          eb('vehicles.color', 'ilike', pattern),
          eb('vehicle_brands.name', 'ilike', pattern),
          eb('vehicle_models.name', 'ilike', pattern),
        ]),
      );
    }

    if (filters.status !== undefined) {
      base = Array.isArray(filters.status)
        ? base.where('vehicles.status', 'in', filters.status)
        : base.where('vehicles.status', '=', filters.status);
    }

    if (filters.brandId !== undefined) {
      base = base.where('vehicles.brand_id', '=', filters.brandId);
    }
    if (filters.modelId !== undefined) {
      base = base.where('vehicles.model_id', '=', filters.modelId);
    }
    if (filters.yearFrom !== undefined) {
      base = base.where('vehicles.year', '>=', filters.yearFrom);
    }
    if (filters.yearTo !== undefined) {
      base = base.where('vehicles.year', '<=', filters.yearTo);
    }
    if (filters.priceFrom !== undefined) {
      base = base.where('vehicles.sale_price', '>=', filters.priceFrom);
    }
    if (filters.priceTo !== undefined) {
      base = base.where('vehicles.sale_price', '<=', filters.priceTo);
    }
    if (filters.isActive !== undefined) {
      base = base.where('vehicles.is_active', '=', filters.isActive);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('vehicles')
      .select(['vehicle_brands.name as brand_name', 'vehicle_models.name as model_name'])
      .orderBy('vehicles.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    // Una sola consulta para las imagenes de toda la pagina en lugar de una por
    // vehiculo (evita el N+1 en el listado del catalogo).
    const vehicleIds = rows.map((row) => row.id);
    const imageRows =
      vehicleIds.length === 0
        ? []
        : await this.db
            .selectFrom('vehicle_images')
            .selectAll()
            .where('vehicle_id', 'in', vehicleIds)
            .orderBy('is_primary', 'desc')
            .orderBy('created_at', 'asc')
            .execute();

    const imagesByVehicle = new Map<string, VehicleImage[]>();
    for (const imageRow of imageRows) {
      const bucket = imagesByVehicle.get(imageRow.vehicle_id) ?? [];
      bucket.push(mapImage(imageRow));
      imagesByVehicle.set(imageRow.vehicle_id, bucket);
    }

    const items = rows.map((row) => ({
      ...mapVehicle(row),
      brandName: row.brand_name,
      modelName: row.model_name,
      images: imagesByVehicle.get(row.id) ?? [],
    }));

    return buildPaginatedResult(items, Number(totalRow.total), page);
  }

  async create(data: NewVehicle): Promise<Vehicle> {
    const row = await this.db
      .insertInto('vehicles')
      .values({
        brand_id: data.brandId,
        model_id: data.modelId,
        year: data.year,
        chassis_number: data.chassisNumber,
        color: data.color,
        mileage: data.mileage,
        engine_number: data.engineNumber,
        transmission_type: data.transmissionType,
        fuel_type: data.fuelType,
        sale_price: data.salePrice,
        status: data.status,
        notes: data.notes,
        is_active: data.isActive,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapVehicle(row);
  }

  async update(id: string, data: VehicleUpdate): Promise<Vehicle | null> {
    const patch = {
      ...(data.brandId !== undefined ? { brand_id: data.brandId } : {}),
      ...(data.modelId !== undefined ? { model_id: data.modelId } : {}),
      ...(data.year !== undefined ? { year: data.year } : {}),
      ...(data.chassisNumber !== undefined ? { chassis_number: data.chassisNumber } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.mileage !== undefined ? { mileage: data.mileage } : {}),
      ...(data.engineNumber !== undefined ? { engine_number: data.engineNumber } : {}),
      ...(data.transmissionType !== undefined
        ? { transmission_type: data.transmissionType }
        : {}),
      ...(data.fuelType !== undefined ? { fuel_type: data.fuelType } : {}),
      ...(data.salePrice !== undefined ? { sale_price: data.salePrice } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('vehicles')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapVehicle(row);
  }

  async updateStatus(id: string, status: VehicleStatus): Promise<Vehicle | null> {
    const row = await this.db
      .updateTable('vehicles')
      .set({ status })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapVehicle(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('vehicles')
      .set({ deleted_at: sql<Date>`now()`, is_active: false })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async countByStatus(): Promise<Record<VehicleStatus, number>> {
    const rows = await this.db
      .selectFrom('vehicles')
      .select(['status'])
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('deleted_at', 'is', null)
      .groupBy('status')
      .execute();

    const counts = Object.fromEntries(
      VEHICLE_STATUSES.map((status) => [status, 0]),
    ) as Record<VehicleStatus, number>;

    for (const row of rows) {
      counts[row.status] = Number(row.total);
    }

    return counts;
  }

  async listImages(vehicleId: string): Promise<VehicleImage[]> {
    const rows = await this.db
      .selectFrom('vehicle_images')
      .selectAll()
      .where('vehicle_id', '=', vehicleId)
      .orderBy('is_primary', 'desc')
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map(mapImage);
  }

  async findImageById(imageId: string): Promise<VehicleImage | null> {
    const row = await this.db
      .selectFrom('vehicle_images')
      .selectAll()
      .where('id', '=', imageId)
      .executeTakeFirst();

    return row === undefined ? null : mapImage(row);
  }

  async addImage(vehicleId: string, url: string, isPrimary: boolean): Promise<VehicleImage> {
    const row = await this.db
      .insertInto('vehicle_images')
      .values({ vehicle_id: vehicleId, url, is_primary: isPrimary })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapImage(row);
  }

  async deleteImage(imageId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('vehicle_images')
      .where('id', '=', imageId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  async setPrimaryImage(vehicleId: string, imageId: string): Promise<VehicleImage | null> {
    await this.db
      .updateTable('vehicle_images')
      .set({ is_primary: false })
      .where('vehicle_id', '=', vehicleId)
      .where('id', '!=', imageId)
      .execute();

    const row = await this.db
      .updateTable('vehicle_images')
      .set({ is_primary: true })
      .where('id', '=', imageId)
      .where('vehicle_id', '=', vehicleId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapImage(row);
  }
}
