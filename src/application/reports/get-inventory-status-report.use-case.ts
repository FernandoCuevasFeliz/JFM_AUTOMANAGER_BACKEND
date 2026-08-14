import type { InventoryStatusRow } from '../../domain/reports/report.entity';
import type { ReportRepository } from '../../domain/reports/report.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

/**
 * Conteo de vehiculos activos por estado.
 *
 * Devuelve SIEMPRE los seis estados, incluidos los que estan en cero, para que
 * el tablero no cambie de forma segun el dia. No lleva filtros: es la foto
 * completa del inventario o no es un conteo de inventario.
 */
export class GetInventoryStatusReportUseCase implements UseCase<void, InventoryStatusRow[]> {
  constructor(private readonly reports: ReportRepository) {}

  async execute(): Promise<Result<InventoryStatusRow[], DomainError>> {
    return ok(await this.reports.inventoryStatus());
  }
}
