import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { VehicleStatus } from '../../domain/vehicles/vehicle.entity';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import type { UseCase } from '../shared/use-case';

export interface InventorySummary {
  readonly byStatus: Record<VehicleStatus, number>;
  readonly total: number;
  /** Unidades realmente disponibles para vender hoy. */
  readonly available: number;
}

/** Conteo de inventario por estado para el tablero principal. */
export class GetInventorySummaryUseCase implements UseCase<void, InventorySummary> {
  constructor(private readonly vehicles: VehicleRepository) {}

  async execute(): Promise<Result<InventorySummary, DomainError>> {
    const byStatus = await this.vehicles.countByStatus();
    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
    return ok({ byStatus, total, available: byStatus.in_inventory });
  }
}
