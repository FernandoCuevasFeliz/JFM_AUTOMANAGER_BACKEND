import type {
  MonthlyReturnsReportRow,
  MonthlySalesReportRow,
  SalespersonReportRow,
} from '../../domain/reports/report.entity';
import type {
  MonthlyRangeFilters,
  ReportRepository,
  SalespersonReportFilters,
} from '../../domain/reports/report.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface MonthlySalesReportInput {
  readonly filters: MonthlyRangeFilters;
}

/**
 * Ventas COMPLETADAS por mes y moneda.
 *
 * Una venta en proceso todavia puede cancelarse, asi que no cuenta como
 * ingreso del periodo: el corte lo hace la vista, no este caso de uso.
 */
export class GetMonthlySalesReportUseCase
  implements UseCase<MonthlySalesReportInput, MonthlySalesReportRow[]>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: MonthlySalesReportInput,
  ): Promise<Result<MonthlySalesReportRow[], DomainError>> {
    return ok(await this.reports.monthlySales(input.filters));
  }
}

export interface SalesBySalespersonReportInput {
  readonly filters: SalespersonReportFilters;
}

/** Mismo corte que el anterior, abierto por vendedor: ranking de desempeno. */
export class GetSalesBySalespersonReportUseCase
  implements UseCase<SalesBySalespersonReportInput, SalespersonReportRow[]>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: SalesBySalespersonReportInput,
  ): Promise<Result<SalespersonReportRow[], DomainError>> {
    return ok(await this.reports.salesBySalesperson(input.filters));
  }
}

export interface MonthlyReturnsReportInput {
  readonly filters: MonthlyRangeFilters;
}

/**
 * Devoluciones por mes: cuantas unidades volvieron, cuanto valian y cuanto se
 * le reintegro al cliente. Leido junto al reporte de ventas da la tasa de
 * devolucion del periodo.
 *
 * El mes es el de la DEVOLUCION, no el de la venta: es el periodo en que el
 * hecho afecta al inventario y a la caja.
 */
export class GetMonthlyReturnsReportUseCase
  implements UseCase<MonthlyReturnsReportInput, MonthlyReturnsReportRow[]>
{
  constructor(private readonly reports: ReportRepository) {}

  async execute(
    input: MonthlyReturnsReportInput,
  ): Promise<Result<MonthlyReturnsReportRow[], DomainError>> {
    return ok(await this.reports.monthlyReturns(input.filters));
  }
}
