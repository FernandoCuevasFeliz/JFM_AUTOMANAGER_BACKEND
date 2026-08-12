import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  VehicleBrandAlreadyExistsError,
  VehicleBrandNotFoundError,
  VehicleModelAlreadyExistsError,
  VehicleModelNotFoundError,
} from '../../domain/vehicles/vehicle.errors';
import type {
  VehicleBrand,
  VehicleCatalogRepository,
  VehicleModel,
  VehicleModelWithBrand,
} from '../../domain/vehicles/vehicle-catalog.repository';
import type { UseCase } from '../shared/use-case';

// --- Marcas ----------------------------------------------------------------

export interface ListVehicleBrandsInput {
  readonly onlyActive: boolean;
}

export class ListVehicleBrandsUseCase
  implements UseCase<ListVehicleBrandsInput, VehicleBrand[]>
{
  constructor(private readonly catalog: VehicleCatalogRepository) {}

  async execute(input: ListVehicleBrandsInput): Promise<Result<VehicleBrand[], DomainError>> {
    return ok(await this.catalog.listBrands(input.onlyActive));
  }
}

export interface CreateVehicleBrandInput {
  readonly name: string;
}

export class CreateVehicleBrandUseCase
  implements UseCase<CreateVehicleBrandInput, VehicleBrand>
{
  constructor(private readonly catalog: VehicleCatalogRepository) {}

  async execute(input: CreateVehicleBrandInput): Promise<Result<VehicleBrand, DomainError>> {
    const name = input.name.trim();
    if ((await this.catalog.findBrandByName(name)) !== null) {
      return err(new VehicleBrandAlreadyExistsError(name));
    }
    return ok(await this.catalog.createBrand(name));
  }
}

export interface UpdateVehicleBrandInput {
  readonly brandId: string;
  readonly name?: string;
  readonly isActive?: boolean;
}

export class UpdateVehicleBrandUseCase
  implements UseCase<UpdateVehicleBrandInput, VehicleBrand>
{
  constructor(private readonly catalog: VehicleCatalogRepository) {}

  async execute(input: UpdateVehicleBrandInput): Promise<Result<VehicleBrand, DomainError>> {
    const brand = await this.catalog.findBrandById(input.brandId);
    if (brand === null) {
      return err(new VehicleBrandNotFoundError(input.brandId));
    }

    const name = input.name?.trim();
    if (name !== undefined && name !== brand.name) {
      const conflict = await this.catalog.findBrandByName(name);
      if (conflict !== null) {
        return err(new VehicleBrandAlreadyExistsError(name));
      }
    }

    const updated = await this.catalog.updateBrand(input.brandId, {
      ...(name !== undefined ? { name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (updated === null) {
      return err(new VehicleBrandNotFoundError(input.brandId));
    }

    return ok(updated);
  }
}

// --- Modelos ---------------------------------------------------------------

export interface ListVehicleModelsInput {
  readonly brandId?: string;
  readonly onlyActive: boolean;
}

export class ListVehicleModelsUseCase
  implements UseCase<ListVehicleModelsInput, VehicleModelWithBrand[]>
{
  constructor(private readonly catalog: VehicleCatalogRepository) {}

  async execute(
    input: ListVehicleModelsInput,
  ): Promise<Result<VehicleModelWithBrand[], DomainError>> {
    return ok(
      await this.catalog.listModels({
        ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
        onlyActive: input.onlyActive,
      }),
    );
  }
}

export interface CreateVehicleModelInput {
  readonly brandId: string;
  readonly name: string;
}

export class CreateVehicleModelUseCase
  implements UseCase<CreateVehicleModelInput, VehicleModel>
{
  constructor(private readonly catalog: VehicleCatalogRepository) {}

  async execute(input: CreateVehicleModelInput): Promise<Result<VehicleModel, DomainError>> {
    if ((await this.catalog.findBrandById(input.brandId)) === null) {
      return err(new VehicleBrandNotFoundError(input.brandId));
    }

    const name = input.name.trim();
    if ((await this.catalog.findModelByBrandAndName(input.brandId, name)) !== null) {
      return err(new VehicleModelAlreadyExistsError(name));
    }

    return ok(await this.catalog.createModel(input.brandId, name));
  }
}

export interface UpdateVehicleModelInput {
  readonly modelId: string;
  readonly name?: string;
  readonly isActive?: boolean;
}

export class UpdateVehicleModelUseCase
  implements UseCase<UpdateVehicleModelInput, VehicleModel>
{
  constructor(private readonly catalog: VehicleCatalogRepository) {}

  async execute(input: UpdateVehicleModelInput): Promise<Result<VehicleModel, DomainError>> {
    const model = await this.catalog.findModelById(input.modelId);
    if (model === null) {
      return err(new VehicleModelNotFoundError(input.modelId));
    }

    const name = input.name?.trim();
    if (name !== undefined && name !== model.name) {
      const conflict = await this.catalog.findModelByBrandAndName(model.brandId, name);
      if (conflict !== null) {
        return err(new VehicleModelAlreadyExistsError(name));
      }
    }

    const updated = await this.catalog.updateModel(input.modelId, {
      ...(name !== undefined ? { name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (updated === null) {
      return err(new VehicleModelNotFoundError(input.modelId));
    }

    return ok(updated);
  }
}
