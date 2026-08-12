import type { ReservationWithDetails } from '../../domain/reservations/reservation.entity';
import type {
  ReservationFilters,
  ReservationRepository,
} from '../../domain/reservations/reservation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListReservationsInput {
  readonly filters: ReservationFilters;
  readonly page: PageQuery;
}

export class ListReservationsUseCase
  implements UseCase<ListReservationsInput, PaginatedResult<ReservationWithDetails>>
{
  constructor(private readonly reservations: ReservationRepository) {}

  async execute(
    input: ListReservationsInput,
  ): Promise<Result<PaginatedResult<ReservationWithDetails>, DomainError>> {
    return ok(await this.reservations.list(input.filters, input.page));
  }
}
