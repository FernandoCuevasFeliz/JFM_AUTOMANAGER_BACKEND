import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  isCommerciallyManagedStatus,
  type Vehicle,
  type VehicleStatus,
} from '../../domain/vehicles/vehicle.entity';
import {
  ChassisNumberAlreadyExistsError,
  ModelDoesNotBelongToBrandError,
  VehicleBrandNotFoundError,
  VehicleModelNotFoundError,
  VehicleStatusNotManuallyChangeableError,
} from '../../domain/vehicles/vehicle.errors';
import type { VehicleCatalogRepository } from '../../domain/vehicles/vehicle-catalog.repository';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface CreateVehicleInput {
  readonly brandId: string;
  readonly modelId: string;
  readonly year: number;
  readonly chassisNumber: string;
  readonly color: string | null;
  readonly mileage: number | null;
  readonly engineNumber: string | null;
  readonly transmissionType: string | null;
  readonly fuelType: string | null;
  readonly salePrice: number | null;
  readonly status: VehicleStatus;
  readonly notes: string | null;
  readonly isActive: boolean;
}

/**
 * Alta de un vehiculo en el inventario.
 *
 * Invariantes que verifica antes de escribir:
 *  1. La marca y el modelo existen y el modelo pertenece a esa marca (la base
 *     guarda ambas FK por separado y no puede garantizar la coherencia).
 *  2. El numero de chasis (VIN) no esta repetido. Se comprueba aqui para
 *     devolver un 409 con mensaje de negocio en lugar del error de constraint.
 *  3. No se crea un vehiculo directamente como `reserved` ni `sold`: esos
 *     estados solo los produce el ciclo comercial.
 */
export class CreateVehicleUseCase implements UseCase<CreateVehicleInput, Vehicle> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly catalog: VehicleCatalogRepository,
  ) {}

  async execute(input: CreateVehicleInput): Promise<Result<Vehicle, DomainError>> {
    if (isCommerciallyManagedStatus(input.status)) {
      return err(new VehicleStatusNotManuallyChangeableError(input.status));
    }

    const brand = await this.catalog.findBrandById(input.brandId);
    if (brand === null) {
      return err(new VehicleBrandNotFoundError(input.brandId));
    }

    const model = await this.catalog.findModelById(input.modelId);
    if (model === null) {
      return err(new VehicleModelNotFoundError(input.modelId));
    }
    if (model.brandId !== input.brandId) {
      return err(new ModelDoesNotBelongToBrandError(input.modelId, input.brandId));
    }

    const chassisNumber = input.chassisNumber.trim().toUpperCase();
    if (await this.vehicles.existsByChassisNumber(chassisNumber)) {
      return err(new ChassisNumberAlreadyExistsError(chassisNumber));
    }

    const vehicle = await this.vehicles.create({
      brandId: input.brandId,
      modelId: input.modelId,
      year: input.year,
      chassisNumber,
      color: input.color,
      mileage: input.mileage,
      engineNumber: input.engineNumber,
      transmissionType: input.transmissionType,
      fuelType: input.fuelType,
      salePrice: input.salePrice,
      status: input.status,
      notes: input.notes,
      isActive: input.isActive,
    });

    return ok(vehicle);
  }
}
