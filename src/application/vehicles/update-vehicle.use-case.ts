import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Vehicle } from '../../domain/vehicles/vehicle.entity';
import {
  ChassisNumberAlreadyExistsError,
  ModelDoesNotBelongToBrandError,
  VehicleBrandNotFoundError,
  VehicleModelNotFoundError,
  VehicleNotFoundError,
} from '../../domain/vehicles/vehicle.errors';
import type { VehicleCatalogRepository } from '../../domain/vehicles/vehicle-catalog.repository';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdateVehicleInput {
  readonly vehicleId: string;
  readonly brandId?: string;
  readonly modelId?: string;
  readonly year?: number;
  readonly chassisNumber?: string;
  readonly color?: string | null;
  readonly mileage?: number | null;
  readonly engineNumber?: string | null;
  readonly transmissionType?: string | null;
  readonly fuelType?: string | null;
  readonly salePrice?: number | null;
  readonly notes?: string | null;
  readonly isActive?: boolean;
}

/**
 * Edicion de la ficha del vehiculo. Deliberadamente NO acepta `status`: el
 * cambio de estado tiene su propio caso de uso porque esta sujeto a la maquina
 * de estados.
 */
export class UpdateVehicleUseCase implements UseCase<UpdateVehicleInput, Vehicle> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly catalog: VehicleCatalogRepository,
  ) {}

  async execute(input: UpdateVehicleInput): Promise<Result<Vehicle, DomainError>> {
    const existing = await this.vehicles.findById(input.vehicleId);
    if (existing === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    const brandId = input.brandId ?? existing.brandId;
    const modelId = input.modelId ?? existing.modelId;

    if (input.brandId !== undefined && (await this.catalog.findBrandById(brandId)) === null) {
      return err(new VehicleBrandNotFoundError(brandId));
    }

    if (input.brandId !== undefined || input.modelId !== undefined) {
      const model = await this.catalog.findModelById(modelId);
      if (model === null) {
        return err(new VehicleModelNotFoundError(modelId));
      }
      if (model.brandId !== brandId) {
        return err(new ModelDoesNotBelongToBrandError(modelId, brandId));
      }
    }

    const chassisNumber = input.chassisNumber?.trim().toUpperCase();
    if (
      chassisNumber !== undefined &&
      chassisNumber !== existing.chassisNumber &&
      (await this.vehicles.existsByChassisNumber(chassisNumber, input.vehicleId))
    ) {
      return err(new ChassisNumberAlreadyExistsError(chassisNumber));
    }

    const updated = await this.vehicles.update(input.vehicleId, {
      ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(chassisNumber !== undefined ? { chassisNumber } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.mileage !== undefined ? { mileage: input.mileage } : {}),
      ...(input.engineNumber !== undefined ? { engineNumber: input.engineNumber } : {}),
      ...(input.transmissionType !== undefined
        ? { transmissionType: input.transmissionType }
        : {}),
      ...(input.fuelType !== undefined ? { fuelType: input.fuelType } : {}),
      ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (updated === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    return ok(updated);
  }
}
