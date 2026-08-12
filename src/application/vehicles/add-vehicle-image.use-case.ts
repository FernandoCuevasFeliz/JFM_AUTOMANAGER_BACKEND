import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { VehicleImage } from '../../domain/vehicles/vehicle.entity';
import { VehicleNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface AddVehicleImageInput {
  readonly vehicleId: string;
  readonly url: string;
  readonly isPrimary: boolean;
}

/**
 * Agrega una imagen al agregado Vehiculo.
 *
 * La primera imagen que se sube queda como principal aunque no se pida:
 * un vehiculo con imagenes pero sin principal no tendria portada en el
 * catalogo.
 */
export class AddVehicleImageUseCase implements UseCase<AddVehicleImageInput, VehicleImage> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: AddVehicleImageInput): Promise<Result<VehicleImage, DomainError>> {
    const vehicle = await this.vehicles.findById(input.vehicleId);
    if (vehicle === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    const existingImages = await this.vehicles.listImages(input.vehicleId);
    const shouldBePrimary = input.isPrimary || existingImages.length === 0;

    const image = await this.vehicles.addImage(input.vehicleId, input.url, shouldBePrimary);

    if (shouldBePrimary) {
      const primary = await this.vehicles.setPrimaryImage(input.vehicleId, image.id);
      if (primary !== null) {
        return ok(primary);
      }
    }

    return ok(image);
  }
}
