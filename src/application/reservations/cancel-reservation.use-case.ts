import type { ReservationWithDetails } from '../../domain/reservations/reservation.entity';
import { canTransitionReservationTo } from '../../domain/reservations/reservation.entity';
import {
  InvalidReservationStatusTransitionError,
  ReservationNotFoundError,
} from '../../domain/reservations/reservation.errors';
import type { ReservationRepository } from '../../domain/reservations/reservation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { UseCase } from '../shared/use-case';

export interface CancelReservationInput {
  readonly reservationId: string;
}

/**
 * El cliente desiste: la reserva se cancela y el vehiculo vuelve a estar
 * disponible. Ambas cosas en la misma transaccion, porque una reserva
 * cancelada con el vehiculo todavia en `reserved` lo dejaria bloqueado para
 * siempre.
 */
export class CancelReservationUseCase
  implements UseCase<CancelReservationInput, ReservationWithDetails>
{
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly reservations: ReservationRepository,
  ) {}

  async execute(
    input: CancelReservationInput,
  ): Promise<Result<ReservationWithDetails, DomainError>> {
    const result = await this.unitOfWork.run<void, DomainError>(async (trx) => {
      const reservation = await trx.reservations.findById(input.reservationId);
      if (reservation === null) {
        return err(new ReservationNotFoundError(input.reservationId));
      }

      if (!canTransitionReservationTo(reservation.status, 'cancelled')) {
        return err(new InvalidReservationStatusTransitionError(reservation.status, 'cancelled'));
      }

      await trx.reservations.updateStatus(input.reservationId, 'cancelled');

      const vehicle = await trx.vehicles.findById(reservation.vehicleId);
      if (vehicle !== null && vehicle.status === 'reserved') {
        await trx.vehicles.updateStatus(reservation.vehicleId, 'in_inventory');
      }

      return ok(undefined);
    });

    if (!result.ok) {
      return result;
    }

    const updated = await this.reservations.findByIdWithDetails(input.reservationId);
    if (updated === null) {
      return err(new ReservationNotFoundError(input.reservationId));
    }

    return ok(updated);
  }
}
