import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type {
  CreateExpenseCategoryUseCase,
  ListCatalogsUseCase,
} from '../../../application/catalogs/list-catalogs.use-case';
import { sendResult } from '../shared/http-response';
import type { CreateExpenseCategoryBody, ListCatalogsQuery } from './catalogs.schemas';

export interface CatalogsControllerDeps {
  readonly listCatalogs: UseCaseOf<ListCatalogsUseCase>;
  readonly createExpenseCategory: UseCaseOf<CreateExpenseCategoryUseCase>;
}

export class CatalogsController {
  constructor(private readonly deps: CatalogsControllerDeps) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListCatalogsQuery;
    const result = await this.deps.listCatalogs.execute({
      onlyActive: query.includeInactive !== true,
    });
    sendResult(res, next, result);
  };

  createExpenseCategoryHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = await this.deps.createExpenseCategory.execute(
      req.body as CreateExpenseCategoryBody,
    );
    sendResult(res, next, result, 201);
  };
}
