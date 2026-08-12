import type { ReservationWithDetails } from '../../domain/reservations/reservation.entity';
import { ReservationNotFoundError } from '../../domain/reservations/reservation.errors';
import type { ReservationRepository } from '../../domain/reservations/reservation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetReservationInput {
  readonly reservationId: string;
}

export class GetReservationUseCase
  implements UseCase<GetReservationInput, ReservationWithDetails>
{
  constructor(private readonly reservations: ReservationRepository) {}

  async execute(
    input: GetReservationInput,
  ): Promise<Result<ReservationWithDetails, DomainError>> {
    const reservation = await this.reservations.findByIdWithDetails(input.reservationId);
    if (reservation === null) {
      return err(new ReservationNotFoundError(input.reservationId));
    }
    return ok(reservation);
  }
}
