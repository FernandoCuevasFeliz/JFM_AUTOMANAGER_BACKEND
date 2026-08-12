import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { VehicleWithDetails } from '../../domain/vehicles/vehicle.entity';
import { VehicleNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface GetVehicleInput {
  readonly vehicleId: string;
}

export class GetVehicleUseCase implements UseCase<GetVehicleInput, VehicleWithDetails> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: GetVehicleInput): Promise<Result<VehicleWithDetails, DomainError>> {
    const vehicle = await this.vehicles.findByIdWithDetails(input.vehicleId);
    if (vehicle === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }
    return ok(vehicle);
  }
}
