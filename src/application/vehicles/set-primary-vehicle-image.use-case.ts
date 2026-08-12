import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { VehicleImage } from '../../domain/vehicles/vehicle.entity';
import { VehicleImageNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface SetPrimaryVehicleImageInput {
  readonly vehicleId: string;
  readonly imageId: string;
}

export class SetPrimaryVehicleImageUseCase
  implements UseCase<SetPrimaryVehicleImageInput, VehicleImage>
{
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: SetPrimaryVehicleImageInput): Promise<Result<VehicleImage, DomainError>> {
    const image = await this.vehicles.findImageById(input.imageId);
    if (image === null || image.vehicleId !== input.vehicleId) {
      return err(new VehicleImageNotFoundError(input.imageId));
    }

    const primary = await this.vehicles.setPrimaryImage(input.vehicleId, input.imageId);
    if (primary === null) {
      return err(new VehicleImageNotFoundError(input.imageId));
    }

    return ok(primary);
  }
}
