import type { NextFunction, Request, Response } from 'express';
import type { GetAccountsReceivableUseCase } from '../../../application/reports/get-accounts-receivable.use-case';
import type { GetFiscalDocumentsReportUseCase } from '../../../application/reports/get-fiscal-documents-report.use-case';
import type { GetInventoryStatusReportUseCase } from '../../../application/reports/get-inventory-status-report.use-case';
import type { GetMonthlyExpensesReportUseCase } from '../../../application/reports/get-monthly-expenses-report.use-case';
import type {
  GetMonthlySalesReportUseCase,
  GetSalesBySalespersonReportUseCase,
} from '../../../application/reports/get-sales-reports.use-case';
import type { GetVehicleProfitabilityUseCase } from '../../../application/reports/get-vehicle-profitability.use-case';
import type { UseCaseOf } from '../../../application/shared/use-case';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  AccountsReceivableQuery,
  FiscalDocumentsQuery,
  MonthlyExpensesQuery,
  MonthlySalesQuery,
  SalesBySalespersonQuery,
  VehicleProfitabilityQuery,
} from './reports.schemas';

export interface ReportsControllerDeps {
  readonly vehicleProfitability: UseCaseOf<GetVehicleProfitabilityUseCase>;
  readonly accountsReceivable: UseCaseOf<GetAccountsReceivableUseCase>;
  readonly monthlySales: UseCaseOf<GetMonthlySalesReportUseCase>;
  readonly salesBySalesperson: UseCaseOf<GetSalesBySalespersonReportUseCase>;
  readonly monthlyExpenses: UseCaseOf<GetMonthlyExpensesReportUseCase>;
  readonly inventoryStatus: UseCaseOf<GetInventoryStatusReportUseCase>;
  readonly fiscalDocuments: UseCaseOf<GetFiscalDocumentsReportUseCase>;
}

/**
 * Reportes: todo GET, todo de solo lectura.
 *
 * Los dos listados por documento (rentabilidad y cuentas por cobrar) se
 * paginan porque crecen con la operacion; los agregados mensuales devuelven
 * el arreglo completo, acotado por el rango de fechas.
 */
export class ReportsController {
  constructor(private readonly deps: ReportsControllerDeps) {}

  vehicleProfitability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const query = req.query as unknown as VehicleProfitabilityQuery;
    const result = await this.deps.vehicleProfitability.execute({
      filters: compact({
        search: query.search,
        status: query.status,
        vehicleId: query.vehicleId,
        sold: query.sold,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  accountsReceivable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as AccountsReceivableQuery;
    const result = await this.deps.accountsReceivable.execute({
      filters: compact({
        search: query.search,
        clientId: query.clientId,
        salespersonId: query.salespersonId,
        // Una venta ya saldada no es una cuenta POR COBRAR: solo aparece si se
        // pide explicitamente `?onlyPending=false`.
        onlyPending: query.onlyPending ?? true,
        minDaysOutstanding: query.minDaysOutstanding,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  monthlySales = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as MonthlySalesQuery;
    const result = await this.deps.monthlySales.execute({
      filters: compact({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        currencyCode: query.currency,
      }),
    });
    sendResult(res, next, result);
  };

  salesBySalesperson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as SalesBySalespersonQuery;
    const result = await this.deps.salesBySalesperson.execute({
      filters: compact({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        currencyCode: query.currency,
        salespersonId: query.salespersonId,
      }),
    });
    sendResult(res, next, result);
  };

  monthlyExpenses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as MonthlyExpensesQuery;
    const result = await this.deps.monthlyExpenses.execute({
      filters: compact({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        currencyCode: query.currency,
        categoryId: query.categoryId,
        scope: query.scope,
      }),
    });
    sendResult(res, next, result);
  };

  inventoryStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.inventoryStatus.execute(undefined);
    sendResult(res, next, result);
  };

  fiscalDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as FiscalDocumentsQuery;
    const result = await this.deps.fiscalDocuments.execute({
      filters: compact({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        currencyCode: query.currency,
        documentKind: query.documentKind,
        ncfType: query.ncfType,
        status: query.status,
      }),
    });
    sendResult(res, next, result);
  };
}
