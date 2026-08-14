import type { VehicleProfitability } from '../../domain/reports/report.entity';
import type {
  ReportRepository,
  VehicleProfitabilityFilters,
} from '../../domain/reports/report.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetVehicleProfitabilityInput {
  readonly filters: VehicleProfitabilityFilters;
  readonly page: PageQuery;
}

/**
 * Rentabilidad por unidad: costo real (compra + gastos) contra lo que se cobro.
 *
 * Los casos de uso de reportes son delgados a proposito. No hay regla de
 * negocio que aplicar sobre una consulta agregada, y el calculo vive en la
 * vista SQL; su papel es fijar el contrato (que filtros existen, que forma
 * tiene la salida) y mantener a la capa HTTP sin conocer el repositorio.
 */
export class GetVehicleProfitabilityUseCase
  implements UseCase<GetVehicleProfitabilityInput, PaginatedResult<VehicleProfitability>>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: GetVehicleProfitabilityInput,
  ): Promise<Result<PaginatedResult<VehicleProfitability>, DomainError>> {
    return ok(await this.reports.vehicleProfitability(input.filters, input.page));
  }
}
