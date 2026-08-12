import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { UseCase } from '../shared/use-case';

export interface ExpireReservationsOutput {
  readonly expired: number;
  readonly releasedVehicles: number;
}

/**
 * Vence las reservas cuyo plazo ya paso y devuelve sus vehiculos al inventario.
 *
 * Es la contraparte automatica de `cancel-reservation`: sin ella, un cliente
 * que nunca vuelve dejaria una unidad bloqueada indefinidamente. Pensado para
 * una tarea diaria; tambien se expone como endpoint de mantenimiento.
 */
export class ExpireReservationsUseCase implements UseCase<void, ExpireReservationsOutput> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<ExpireReservationsOutput, DomainError>> {
    const today = this.clock.today();

    return this.unitOfWork.run<ExpireReservationsOutput, DomainError>(async (trx) => {
      const expired = await trx.reservations.expireOverdue(today);

      let releasedVehicles = 0;
      for (const { vehicleId } of expired) {
        const vehicle = await trx.vehicles.findById(vehicleId);
        if (vehicle !== null && vehicle.status === 'reserved') {
          await trx.vehicles.updateStatus(vehicleId, 'in_inventory');
          releasedVehicles += 1;
        }
      }

      return ok({ expired: expired.length, releasedVehicles });
    });
  }
}
