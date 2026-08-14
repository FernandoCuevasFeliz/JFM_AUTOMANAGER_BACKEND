import type { MonthlyExpensesReportRow } from '../../domain/reports/report.entity';
import type {
  MonthlyExpensesFilters,
  ReportRepository,
} from '../../domain/reports/report.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface MonthlyExpensesReportInput {
  readonly filters: MonthlyExpensesFilters;
}

/**
 * Gastos por mes, categoria, alcance y moneda.
 *
 * El alcance (`general` / `vehicle`) es el del gasto: si quedo imputado a una
 * unidad concreta o si fue de la operacion en general.
 */
export class GetMonthlyExpensesReportUseCase
  implements UseCase<MonthlyExpensesReportInput, MonthlyExpensesReportRow[]>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: MonthlyExpensesReportInput,
  ): Promise<Result<MonthlyExpensesReportRow[], DomainError>> {
    return ok(await this.reports.monthlyExpenses(input.filters));
  }
}
