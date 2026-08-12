import type {
  NewVehicle,
  Vehicle,
  VehicleImage,
  VehicleStatus,
  VehicleUpdate,
  VehicleWithDetails,
} from '../../src/domain/vehicles/vehicle.entity';
import { VEHICLE_STATUSES } from '../../src/domain/vehicles/vehicle.entity';
import type {
  VehicleFilters,
  VehicleRepository,
} from '../../src/domain/vehicles/vehicle.repository';
import type {
  VehicleBrand,
  VehicleCatalogRepository,
  VehicleModel,
  VehicleModelWithBrand,
} from '../../src/domain/vehicles/vehicle-catalog.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
} from '../../src/domain/shared/pagination';

/**
 * Dobles en memoria de los puertos de `vehicles`.
 *
 * Se prefieren sobre mocks con expectativas por llamada porque los casos de uso
 * se prueban por su efecto observable (que queda guardado, con que estado), no
 * por la secuencia exacta de metodos que invocan: eso deja los tests libres de
 * romperse ante una refactorizacion que no cambia el comportamiento.
 */

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}-${(sequence += 1)}`;

export function resetIds(): void {
  sequence = 0;
}

export function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  const now = new Date('2026-01-15T10:00:00Z');
  return {
    id: nextId('vehicle'),
    brandId: 'brand-1',
    modelId: 'model-1',
    year: 2023,
    chassisNumber: 'JT2BF22K1X0123456',
    color: 'Blanco',
    mileage: 15_000,
    engineNumber: 'ENG-001',
    transmissionType: 'automatica',
    fuelType: 'gasolina',
    salePrice: 1_250_000,
    status: 'in_inventory',
    notes: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

export class FakeVehicleRepository implements VehicleRepository {
  readonly vehicles = new Map<string, Vehicle>();
  readonly images = new Map<string, VehicleImage>();

  constructor(initial: Vehicle[] = []) {
    for (const vehicle of initial) {
      this.vehicles.set(vehicle.id, vehicle);
    }
  }

  seedImage(image: VehicleImage): VehicleImage {
    this.images.set(image.id, image);
    return image;
  }

  async findById(id: string): Promise<Vehicle | null> {
    const vehicle = this.vehicles.get(id);
    return vehicle === undefined || vehicle.deletedAt !== null ? null : vehicle;
  }

  async findByIdWithDetails(id: string): Promise<VehicleWithDetails | null> {
    const vehicle = await this.findById(id);
    if (vehicle === null) {
      return null;
    }
    return {
      ...vehicle,
      brandName: 'Toyota',
      modelName: 'Corolla',
      images: await this.listImages(id),
    };
  }

  async findByChassisNumber(chassisNumber: string): Promise<Vehicle | null> {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.chassisNumber === chassisNumber && vehicle.deletedAt === null) {
        return vehicle;
      }
    }
    return null;
  }

  async existsByChassisNumber(chassisNumber: string, excludeVehicleId?: string): Promise<boolean> {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.chassisNumber === chassisNumber && vehicle.id !== excludeVehicleId) {
        return true;
      }
    }
    return false;
  }

  async list(
    filters: VehicleFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<VehicleWithDetails>> {
    const all = [...this.vehicles.values()].filter((vehicle) => {
      if (vehicle.deletedAt !== null) {
        return false;
      }
      if (filters.status !== undefined) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        if (!statuses.includes(vehicle.status)) {
          return false;
        }
      }
      if (filters.brandId !== undefined && vehicle.brandId !== filters.brandId) {
        return false;
      }
      return true;
    });

    const start = (page.page - 1) * page.pageSize;
    const items = all.slice(start, start + page.pageSize).map((vehicle) => ({
      ...vehicle,
      brandName: 'Toyota',
      modelName: 'Corolla',
      images: [] as VehicleImage[],
    }));

    return buildPaginatedResult(items, all.length, page);
  }

  async create(data: NewVehicle): Promise<Vehicle> {
    const now = new Date('2026-01-15T10:00:00Z');
    const vehicle: Vehicle = {
      id: nextId('vehicle'),
      ...data,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async update(id: string, data: VehicleUpdate): Promise<Vehicle | null> {
    const existing = await this.findById(id);
    if (existing === null) {
      return null;
    }
    const updated: Vehicle = { ...existing, ...data, updatedAt: new Date() };
    this.vehicles.set(id, updated);
    return updated;
  }

  async updateStatus(id: string, status: VehicleStatus): Promise<Vehicle | null> {
    const existing = await this.findById(id);
    if (existing === null) {
      return null;
    }
    const updated: Vehicle = { ...existing, status, updatedAt: new Date() };
    this.vehicles.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (existing === null) {
      return false;
    }
    this.vehicles.set(id, { ...existing, deletedAt: new Date(), isActive: false });
    return true;
  }

  async countByStatus(): Promise<Record<VehicleStatus, number>> {
    const counts = Object.fromEntries(VEHICLE_STATUSES.map((status) => [status, 0])) as Record<
      VehicleStatus,
      number
    >;
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.deletedAt === null) {
        counts[vehicle.status] += 1;
      }
    }
    return counts;
  }

  async listImages(vehicleId: string): Promise<VehicleImage[]> {
    return [...this.images.values()]
      .filter((image) => image.vehicleId === vehicleId)
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) {
          return a.isPrimary ? -1 : 1;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  async findImageById(imageId: string): Promise<VehicleImage | null> {
    return this.images.get(imageId) ?? null;
  }

  async addImage(vehicleId: string, url: string, isPrimary: boolean): Promise<VehicleImage> {
    const image: VehicleImage = {
      id: nextId('image'),
      vehicleId,
      url,
      isPrimary,
      createdAt: new Date(Date.now() + this.images.size),
      updatedAt: new Date(),
    };
    this.images.set(image.id, image);
    return image;
  }

  async deleteImage(imageId: string): Promise<boolean> {
    return this.images.delete(imageId);
  }

  async setPrimaryImage(vehicleId: string, imageId: string): Promise<VehicleImage | null> {
    const target = this.images.get(imageId);
    if (target === undefined || target.vehicleId !== vehicleId) {
      return null;
    }
    for (const [id, image] of this.images) {
      if (image.vehicleId === vehicleId) {
        this.images.set(id, { ...image, isPrimary: id === imageId });
      }
    }
    return this.images.get(imageId) ?? null;
  }
}

export class FakeVehicleCatalogRepository implements VehicleCatalogRepository {
  readonly brands = new Map<string, VehicleBrand>();
  readonly models = new Map<string, VehicleModel>();

  constructor() {
    const now = new Date('2026-01-01T00:00:00Z');
    this.brands.set('brand-1', {
      id: 'brand-1',
      name: 'Toyota',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    this.brands.set('brand-2', {
      id: 'brand-2',
      name: 'Honda',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    this.models.set('model-1', {
      id: 'model-1',
      brandId: 'brand-1',
      name: 'Corolla',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    this.models.set('model-2', {
      id: 'model-2',
      brandId: 'brand-2',
      name: 'Civic',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async findBrandById(id: string): Promise<VehicleBrand | null> {
    return this.brands.get(id) ?? null;
  }

  async findBrandByName(name: string): Promise<VehicleBrand | null> {
    return [...this.brands.values()].find((brand) => brand.name === name) ?? null;
  }

  async listBrands(onlyActive: boolean): Promise<VehicleBrand[]> {
    return [...this.brands.values()].filter((brand) => !onlyActive || brand.isActive);
  }

  async createBrand(name: string): Promise<VehicleBrand> {
    const now = new Date();
    const brand: VehicleBrand = { id: nextId('brand'), name, isActive: true, createdAt: now, updatedAt: now };
    this.brands.set(brand.id, brand);
    return brand;
  }

  async updateBrand(
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<VehicleBrand | null> {
    const existing = this.brands.get(id);
    if (existing === undefined) {
      return null;
    }
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.brands.set(id, updated);
    return updated;
  }

  async findModelById(id: string): Promise<VehicleModel | null> {
    return this.models.get(id) ?? null;
  }

  async findModelByBrandAndName(brandId: string, name: string): Promise<VehicleModel | null> {
    return (
      [...this.models.values()].find(
        (model) => model.brandId === brandId && model.name === name,
      ) ?? null
    );
  }

  async listModels(filters: {
    brandId?: string;
    onlyActive: boolean;
  }): Promise<VehicleModelWithBrand[]> {
    return [...this.models.values()]
      .filter((model) => filters.brandId === undefined || model.brandId === filters.brandId)
      .filter((model) => !filters.onlyActive || model.isActive)
      .map((model) => ({
        ...model,
        brandName: this.brands.get(model.brandId)?.name ?? '',
      }));
  }

  async createModel(brandId: string, name: string): Promise<VehicleModel> {
    const now = new Date();
    const model: VehicleModel = {
      id: nextId('model'),
      brandId,
      name,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.models.set(model.id, model);
    return model;
  }

  async updateModel(
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<VehicleModel | null> {
    const existing = this.models.get(id);
    if (existing === undefined) {
      return null;
    }
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.models.set(id, updated);
    return updated;
  }
}
