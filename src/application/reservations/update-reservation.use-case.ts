import type { ReservationWithDetails } from '../../domain/reservations/reservation.entity';
import {
  InvalidReservationPeriodError,
  InvalidReservationStatusTransitionError,
  ReservationNotFoundError,
} from '../../domain/reservations/reservation.errors';
import type { ReservationRepository } from '../../domain/reservations/reservation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface UpdateReservationInput {
  readonly reservationId: string;
  /** Prorroga del plazo. */
  readonly expirationDate?: string;
  /** Ajuste del deposito (el cliente abona mas antes de formalizar la venta). */
  readonly depositAmount?: number;
}

/** Solo se ajustan reservas activas: las cerradas son historia. */
export class UpdateReservationUseCase
  implements UseCase<UpdateReservationInput, ReservationWithDetails>
{
  constructor(private readonly reservations: ReservationRepository) {}

  async execute(
    input: UpdateReservationInput,
  ): Promise<Result<ReservationWithDetails, DomainError>> {
    const reservation = await this.reservations.findById(input.reservationId);
    if (reservation === null) {
      return err(new ReservationNotFoundError(input.reservationId));
    }

    if (reservation.status !== 'active') {
      return err(new InvalidReservationStatusTransitionError(reservation.status, 'active'));
    }

    if (
      input.expirationDate !== undefined &&
      input.expirationDate <= reservation.reservationDate
    ) {
      return err(new InvalidReservationPeriodError());
    }

    await this.reservations.update(input.reservationId, {
      ...(input.expirationDate !== undefined ? { expirationDate: input.expirationDate } : {}),
      ...(input.depositAmount !== undefined ? { depositAmount: input.depositAmount } : {}),
    });

    const updated = await this.reservations.findByIdWithDetails(input.reservationId);
    if (updated === null) {
      return err(new ReservationNotFoundError(input.reservationId));
    }

    return ok(updated);
  }
}
