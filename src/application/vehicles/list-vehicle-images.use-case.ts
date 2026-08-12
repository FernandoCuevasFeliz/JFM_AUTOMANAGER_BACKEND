import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { VehicleImage } from '../../domain/vehicles/vehicle.entity';
import { VehicleNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface ListVehicleImagesInput {
  readonly vehicleId: string;
}

export class ListVehicleImagesUseCase implements UseCase<ListVehicleImagesInput, VehicleImage[]> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: ListVehicleImagesInput): Promise<Result<VehicleImage[], DomainError>> {
    const vehicle = await this.vehicles.findById(input.vehicleId);
    if (vehicle === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }
    return ok(await this.vehicles.listImages(input.vehicleId));
  }
}
