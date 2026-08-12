import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { ChangeQuotationStatusUseCase } from '../../../application/quotations/change-quotation-status.use-case';
import type { CreateQuotationUseCase } from '../../../application/quotations/create-quotation.use-case';
import type { DeleteQuotationUseCase } from '../../../application/quotations/delete-quotation.use-case';
import type { ExpireQuotationsUseCase } from '../../../application/quotations/expire-quotations.use-case';
import type { GetQuotationUseCase } from '../../../application/quotations/get-quotation.use-case';
import type { ListQuotationsUseCase } from '../../../application/quotations/list-quotations.use-case';
import type { UpdateQuotationUseCase } from '../../../application/quotations/update-quotation.use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  ChangeQuotationStatusBody,
  CreateQuotationBody,
  ListQuotationsQuery,
  UpdateQuotationBody,
} from './quotations.schemas';

export interface QuotationsControllerDeps {
  readonly createQuotation: UseCaseOf<CreateQuotationUseCase>;
  readonly updateQuotation: UseCaseOf<UpdateQuotationUseCase>;
  readonly getQuotation: UseCaseOf<GetQuotationUseCase>;
  readonly listQuotations: UseCaseOf<ListQuotationsUseCase>;
  readonly deleteQuotation: UseCaseOf<DeleteQuotationUseCase>;
  readonly changeQuotationStatus: UseCaseOf<ChangeQuotationStatusUseCase>;
  readonly expireQuotations: UseCaseOf<ExpireQuotationsUseCase>;
}

export class QuotationsController {
  constructor(private readonly deps: QuotationsControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateQuotationBody;
    const result = await this.deps.createQuotation.execute({
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateQuotationBody;
    const result = await this.deps.updateQuotation.execute(
      compact({ quotationId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getQuotation.execute({
      quotationId: req.params.id as string,
    });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListQuotationsQuery;
    const result = await this.deps.listQuotations.execute({
      filters: compact({
        search: query.search,
        clientId: query.clientId,
        vehicleId: query.vehicleId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  changeStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as ChangeQuotationStatusBody;
    const result = await this.deps.changeQuotationStatus.execute({
      quotationId: req.params.id as string,
      status: body.status,
    });
    sendResult(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteQuotation.execute({
      quotationId: req.params.id as string,
    });
    sendResult(res, next, result, 204);
  };

  expire = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.expireQuotations.execute(undefined);
    sendResult(res, next, result);
  };
}
