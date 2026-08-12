import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { RESERVATION_STATUS_TRANSITIONS, type ReservationStatus } from './reservation.entity';

export class ReservationNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Reserva', identifier);
  }
}

export class ReservationNumberAlreadyExistsError extends ConflictError {
  constructor(reservationNumber: string) {
    super(`Ya existe una reserva con el numero ${reservationNumber}`, {
      field: 'reservationNumber',
      reservationNumber,
    });
  }
}

export class InvalidReservationStatusTransitionError extends BusinessRuleError {
  constructor(from: ReservationStatus, to: ReservationStatus) {
    const allowed = RESERVATION_STATUS_TRANSITIONS[from];
    super(
      from === to
        ? `La reserva ya se encuentra en estado "${from}"`
        : allowed.length === 0
          ? `Una reserva en estado "${from}" es final y no admite mas cambios`
          : `No se puede pasar una reserva de "${from}" a "${to}". Transiciones validas: ${allowed.join(', ')}`,
      { from, to, allowed },
    );
  }
}

export class VehicleAlreadyReservedError extends ConflictError {
  constructor(vehicleId: string) {
    super('El vehiculo ya tiene una reserva activa', { vehicleId });
  }
}

export class ReservationExpiredError extends BusinessRuleError {
  constructor(reservationId: string, expirationDate: string) {
    super(`La reserva vencio el ${expirationDate} y ya no puede convertirse en venta`, {
      reservationId,
      expirationDate,
    });
  }
}

export class ReservationNotConvertibleError extends BusinessRuleError {
  constructor(reservationId: string, status: ReservationStatus) {
    super(`La reserva en estado "${status}" no puede convertirse en venta`, {
      reservationId,
      status,
    });
  }
}

export class InvalidReservationPeriodError extends BusinessRuleError {
  constructor() {
    super('La fecha de vencimiento de la reserva debe ser posterior a la fecha de reserva');
  }
}

export class ReservationClientMismatchError extends BusinessRuleError {
  constructor() {
    super('El cliente de la venta no coincide con el cliente de la reserva');
  }
}

export class ReservationVehicleMismatchError extends BusinessRuleError {
  constructor() {
    super('El vehiculo de la venta no coincide con el vehiculo de la reserva');
  }
}
