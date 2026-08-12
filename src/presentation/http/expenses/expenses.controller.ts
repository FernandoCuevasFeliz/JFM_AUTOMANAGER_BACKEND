import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { CreateExpenseUseCase } from '../../../application/expenses/create-expense.use-case';
import type { DeleteExpenseUseCase } from '../../../application/expenses/delete-expense.use-case';
import type { GetExpenseUseCase } from '../../../application/expenses/get-expense.use-case';
import type { GetVehicleCostSummaryUseCase } from '../../../application/expenses/get-vehicle-cost-summary.use-case';
import type { ListExpensesUseCase } from '../../../application/expenses/list-expenses.use-case';
import type { UpdateExpenseUseCase } from '../../../application/expenses/update-expense.use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  CreateExpenseBody,
  ListExpensesQuery,
  UpdateExpenseBody,
} from './expenses.schemas';

export interface ExpensesControllerDeps {
  readonly createExpense: UseCaseOf<CreateExpenseUseCase>;
  readonly updateExpense: UseCaseOf<UpdateExpenseUseCase>;
  readonly getExpense: UseCaseOf<GetExpenseUseCase>;
  readonly listExpenses: UseCaseOf<ListExpensesUseCase>;
  readonly deleteExpense: UseCaseOf<DeleteExpenseUseCase>;
  readonly getVehicleCostSummary: UseCaseOf<GetVehicleCostSummaryUseCase>;
}

export class ExpensesController {
  constructor(private readonly deps: ExpensesControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateExpenseBody;
    const result = await this.deps.createExpense.execute({
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateExpenseBody;
    const result = await this.deps.updateExpense.execute(
      compact({ expenseId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getExpense.execute({ expenseId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListExpensesQuery;
    const result = await this.deps.listExpenses.execute({
      filters: compact({
        search: query.search,
        categoryId: query.categoryId,
        vehicleId: query.vehicleId,
        generalOnly: query.generalOnly,
        paymentMethodId: query.paymentMethodId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteExpense.execute({ expenseId: req.params.id as string });
    sendResult(res, next, result, 204);
  };

  /** Costo real y margen de un vehiculo (compra + gastos vs precio de venta). */
  vehicleCostSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getVehicleCostSummary.execute({
      vehicleId: req.params.vehicleId as string,
    });
    sendResult(res, next, result);
  };
}
