import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  NewReservation,
  Reservation,
  ReservationStatus,
  ReservationUpdate,
  ReservationWithDetails,
} from './reservation.entity';

export interface ReservationFilters {
  readonly search?: string;
  readonly clientId?: string;
  readonly vehicleId?: string;
  readonly status?: ReservationStatus;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;
  findByIdWithDetails(id: string): Promise<ReservationWithDetails | null>;
  existsByNumber(reservationNumber: string): Promise<boolean>;
  findActiveByVehicle(vehicleId: string): Promise<Reservation | null>;
  list(
    filters: ReservationFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ReservationWithDetails>>;
  create(data: NewReservation): Promise<Reservation>;
  update(id: string, data: ReservationUpdate): Promise<Reservation | null>;
  updateStatus(id: string, status: ReservationStatus): Promise<Reservation | null>;
  softDelete(id: string): Promise<boolean>;
  /** Vence las reservas activas cuyo plazo ya paso. Devuelve los vehiculos liberados. */
  expireOverdue(today: string): Promise<{ reservationId: string; vehicleId: string }[]>;
  lastNumberForYear(yearPrefix: string): Promise<string | null>;
}
