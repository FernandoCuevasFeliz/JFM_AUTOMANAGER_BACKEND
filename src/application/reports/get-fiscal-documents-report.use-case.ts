import type { FiscalDocumentsReportRow } from '../../domain/reports/report.entity';
import type {
  FiscalDocumentsFilters,
  ReportRepository,
} from '../../domain/reports/report.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface FiscalDocumentsReportInput {
  readonly filters: FiscalDocumentsFilters;
}

/**
 * Comprobantes fiscales por mes, tipo y estado: el control de que se emitio y
 * que quedo rechazado o pendiente ante la DGII.
 *
 * Incluye facturas y notas de credito, distinguidas por `documentKind`; ambas
 * son e-CF y ambas cuentan para el periodo.
 */
export class GetFiscalDocumentsReportUseCase
  implements UseCase<FiscalDocumentsReportInput, FiscalDocumentsReportRow[]>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: FiscalDocumentsReportInput,
  ): Promise<Result<FiscalDocumentsReportRow[], DomainError>> {
    return ok(await this.reports.fiscalDocuments(input.filters));
  }
}
