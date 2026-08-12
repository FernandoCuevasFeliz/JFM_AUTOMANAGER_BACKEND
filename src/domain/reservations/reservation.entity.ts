export type ReservationStatus = 'active' | 'expired' | 'converted' | 'cancelled';

export interface Reservation {
  readonly id: string;
  readonly reservationNumber: string;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly depositAmount: number;
  readonly reservationDate: string;
  readonly expirationDate: string;
  readonly status: ReservationStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ReservationWithDetails extends Reservation {
  readonly clientName: string;
  readonly vehicleChassisNumber: string;
  readonly vehicleBrandName: string;
  readonly vehicleModelName: string;
  readonly vehicleYear: number;
  readonly quotationNumber: string | null;
  readonly createdByName: string;
}

export interface NewReservation {
  readonly reservationNumber: string;
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly depositAmount: number;
  readonly reservationDate: string;
  readonly expirationDate: string;
  readonly status: ReservationStatus;
  readonly createdBy: string;
}

export interface ReservationUpdate {
  readonly depositAmount?: number;
  readonly expirationDate?: string;
}

/**
 * Transiciones validas de una reserva:
 *
 *   active --> converted (terminal, al concretarse la venta)
 *     |  \
 *     |   +--> cancelled (terminal, el cliente desiste)
 *     +------> expired   (terminal, vencio el plazo)
 *
 * Salir de `active` por cualquiera de las tres vias libera el vehiculo:
 * `converted` lo deja `sold`, `cancelled` y `expired` lo devuelven a
 * `in_inventory`.
 */
export const RESERVATION_STATUS_TRANSITIONS: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = {
  active: ['converted', 'cancelled', 'expired'],
  converted: [],
  cancelled: [],
  expired: [],
};

export function canTransitionReservationTo(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  if (from === to) {
    return false;
  }
  return RESERVATION_STATUS_TRANSITIONS[from].includes(to);
}

export function isReservationExpired(reservation: Reservation, today: string): boolean {
  return reservation.expirationDate < today;
}

/** Solo una reserva vigente y no vencida puede convertirse en venta. */
export function isReservationConvertible(reservation: Reservation, today: string): boolean {
  return (
    reservation.deletedAt === null &&
    reservation.status === 'active' &&
    !isReservationExpired(reservation, today)
  );
}
