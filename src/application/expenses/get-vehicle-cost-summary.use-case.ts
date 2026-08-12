import type { VehicleCostSummary } from '../../domain/expenses/expense.entity';
import type { ExpenseRepository } from '../../domain/expenses/expense.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { VehicleNotFoundError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface GetVehicleCostSummaryInput {
  readonly vehicleId: string;
}

/**
 * Costo real de una unidad: lo que costo importarla (`purchase_items`) mas
 * todos los gastos imputados (`expenses` con `vehicle_id`), contrastado con el
 * precio de lista y con el precio al que efectivamente se vendio.
 *
 * Es el numero que la empresa no puede calcular hoy con las hojas de calculo y
 * el que justifica el margen por vehiculo.
 */
export class GetVehicleCostSummaryUseCase
  implements UseCase<GetVehicleCostSummaryInput, VehicleCostSummary>
{
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly vehicles: VehicleRepository,
  ) {}

  async execute(
    input: GetVehicleCostSummaryInput,
  ): Promise<Result<VehicleCostSummary, DomainError>> {
    if ((await this.vehicles.findById(input.vehicleId)) === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    const summary = await this.expenses.vehicleCostSummary(input.vehicleId);
    if (summary === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }

    return ok(summary);
  }
}
