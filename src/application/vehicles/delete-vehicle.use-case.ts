import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import {
  VehicleHasActiveOperationsError,
  VehicleNotFoundError,
} from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface DeleteVehicleInput {
  readonly vehicleId: string;
}

/**
 * Borrado logico de un vehiculo.
 *
 * Se bloquea si el vehiculo esta reservado o vendido: dar de baja del
 * inventario una unidad comprometida con un cliente dejaria la reserva o la
 * venta apuntando a un registro invisible para el resto del sistema.
 */
export class DeleteVehicleUseCase implements UseCase<DeleteVehicleInput, void> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: DeleteVehicleInput): Promise<Result<void, DomainError>> {
    const vehicle = await this.vehicles.findById(input.vehicleId);
    if (vehicle === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    if (vehicle.status === 'sold') {
      return err(
        new VehicleHasActiveOperationsError(input.vehicleId, 'ya tiene una venta registrada'),
      );
    }

    if (vehicle.status === 'reserved') {
      return err(
        new VehicleHasActiveOperationsError(
          input.vehicleId,
          'tiene una reserva activa. Cancele la reserva primero',
        ),
      );
    }

    const deleted = await this.vehicles.softDelete(input.vehicleId);
    if (!deleted) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    return okVoid();
  }
}
