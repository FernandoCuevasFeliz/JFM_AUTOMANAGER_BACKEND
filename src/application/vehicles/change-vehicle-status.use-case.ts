import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  canTransitionTo,
  isCommerciallyManagedStatus,
  type Vehicle,
  type VehicleStatus,
} from '../../domain/vehicles/vehicle.entity';
import {
  InvalidVehicleStatusTransitionError,
  VehicleNotFoundError,
  VehicleStatusNotManuallyChangeableError,
} from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface ChangeVehicleStatusInput {
  readonly vehicleId: string;
  readonly status: VehicleStatus;
}

/**
 * Cambio manual de estado del vehiculo (operacion de inventario).
 *
 * Respeta la maquina de estados de `vehicle.entity.ts` y ademas prohibe entrar
 * o salir de los estados que gobierna el ciclo comercial (`reserved`, `sold`).
 * Reservar o vender se hace creando la reserva o la venta; cancelarlas es lo
 * que devuelve el vehiculo a inventario. Si esto se pudiera hacer a mano el
 * inventario dejaria de cuadrar con las ventas registradas.
 */
export class ChangeVehicleStatusUseCase implements UseCase<ChangeVehicleStatusInput, Vehicle> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(input: ChangeVehicleStatusInput): Promise<Result<Vehicle, DomainError>> {
    const vehicle = await this.vehicles.findById(input.vehicleId);
    if (vehicle === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    if (isCommerciallyManagedStatus(input.status)) {
      return err(new VehicleStatusNotManuallyChangeableError(input.status));
    }

    if (isCommerciallyManagedStatus(vehicle.status)) {
      return err(new VehicleStatusNotManuallyChangeableError(vehicle.status));
    }

    if (!canTransitionTo(vehicle.status, input.status)) {
      return err(new InvalidVehicleStatusTransitionError(vehicle.status, input.status));
    }

    const updated = await this.vehicles.updateStatus(input.vehicleId, input.status);
    if (updated === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    return ok(updated);
  }
}
