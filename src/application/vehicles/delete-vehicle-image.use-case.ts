import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import { VehicleImageNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface DeleteVehicleImageInput {
  readonly vehicleId: string;
  readonly imageId: string;
}

/**
 * Borra una imagen. Si era la principal, promueve la mas antigua de las
 * restantes para que el vehiculo no se quede sin portada.
 */
export class DeleteVehicleImageUseCase implements UseCase<DeleteVehicleImageInput, void> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: DeleteVehicleImageInput): Promise<Result<void, DomainError>> {
    const image = await this.vehicles.findImageById(input.imageId);
    if (image === null || image.vehicleId !== input.vehicleId) {
      return err(new VehicleImageNotFoundError(input.imageId));
    }

    const deleted = await this.vehicles.deleteImage(input.imageId);
    if (!deleted) {
      return err(new VehicleImageNotFoundError(input.imageId));
    }

    if (image.isPrimary) {
      const remaining = await this.vehicles.listImages(input.vehicleId);
      const nextPrimary = remaining[0];
      if (nextPrimary !== undefined) {
        await this.vehicles.setPrimaryImage(input.vehicleId, nextPrimary.id);
      }
    }

    return okVoid();
  }
}
