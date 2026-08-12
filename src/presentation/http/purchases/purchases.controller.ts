import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { ChangePurchaseStatusUseCase } from '../../../application/purchases/change-purchase-status.use-case';
import type { CreatePurchaseUseCase } from '../../../application/purchases/create-purchase.use-case';
import type { DeletePurchaseUseCase } from '../../../application/purchases/delete-purchase.use-case';
import type { GetPurchaseUseCase } from '../../../application/purchases/get-purchase.use-case';
import type { ListPurchasesUseCase } from '../../../application/purchases/list-purchases.use-case';
import type { UpdatePurchaseUseCase } from '../../../application/purchases/update-purchase.use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  ChangePurchaseStatusBody,
  CreatePurchaseBody,
  ListPurchasesQuery,
  UpdatePurchaseBody,
} from './purchases.schemas';

export interface PurchasesControllerDeps {
  readonly createPurchase: UseCaseOf<CreatePurchaseUseCase>;
  readonly updatePurchase: UseCaseOf<UpdatePurchaseUseCase>;
  readonly getPurchase: UseCaseOf<GetPurchaseUseCase>;
  readonly listPurchases: UseCaseOf<ListPurchasesUseCase>;
  readonly deletePurchase: UseCaseOf<DeletePurchaseUseCase>;
  readonly changePurchaseStatus: UseCaseOf<ChangePurchaseStatusUseCase>;
}

export class PurchasesController {
  constructor(private readonly deps: PurchasesControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreatePurchaseBody;
    const result = await this.deps.createPurchase.execute(
      compact({ ...body, actorUserId: requireActorId(req) }),
    );
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdatePurchaseBody;
    const result = await this.deps.updatePurchase.execute(
      compact({ purchaseId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getPurchase.execute({ purchaseId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListPurchasesQuery;
    const result = await this.deps.listPurchases.execute({
      filters: compact({
        search: query.search,
        supplierId: query.supplierId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  changeStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as ChangePurchaseStatusBody;
    const result = await this.deps.changePurchaseStatus.execute({
      purchaseId: req.params.id as string,
      status: body.status,
    });
    sendResult(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deletePurchase.execute({
      purchaseId: req.params.id as string,
    });
    sendResult(res, next, result, 204);
  };
}
