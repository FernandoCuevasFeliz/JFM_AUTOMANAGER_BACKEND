import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { VehicleWithDetails } from '../../domain/vehicles/vehicle.entity';
import type { VehicleFilters, VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface ListVehiclesInput {
  readonly filters: VehicleFilters;
  readonly page: PageQuery;
}

export class ListVehiclesUseCase
  implements UseCase<ListVehiclesInput, PaginatedResult<VehicleWithDetails>>
{
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(
    input: ListVehiclesInput,
  ): Promise<Result<PaginatedResult<VehicleWithDetails>, DomainError>> {
    return ok(await this.vehicles.list(input.filters, input.page));
  }
}
