import type { NextFunction, Request, Response } from 'express';
import type { AddSaleItemUseCase } from '../../../application/sales/add-sale-item.use-case';
import type { CancelSaleUseCase } from '../../../application/sales/cancel-sale.use-case';
import type { CompleteSaleUseCase } from '../../../application/sales/complete-sale.use-case';
import type { CreateSaleUseCase } from '../../../application/sales/create-sale.use-case';
import type { DeleteSaleUseCase } from '../../../application/sales/delete-sale.use-case';
import type { GetSaleUseCase } from '../../../application/sales/get-sale.use-case';
import type { ListSalePaymentsUseCase } from '../../../application/sales/list-sale-payments.use-case';
import type {
  GetSalesSummaryUseCase,
  ListSalesUseCase,
} from '../../../application/sales/list-sales.use-case';
import type { RegisterRefundUseCase } from '../../../application/sales/register-refund.use-case';
import type { RegisterSalePaymentUseCase } from '../../../application/sales/register-sale-payment.use-case';
import type { RemoveSaleItemUseCase } from '../../../application/sales/remove-sale-item.use-case';
import type { ReturnSaleItemUseCase } from '../../../application/sales/return-sale-item.use-case';
import type { UpdateSaleItemUseCase } from '../../../application/sales/update-sale-item.use-case';
import type { UpdateSaleUseCase } from '../../../application/sales/update-sale.use-case';
import type { UseCaseOf } from '../../../application/shared/use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  AddSaleItemBody,
  CreateSaleBody,
  ListSalesQuery,
  RegisterPaymentBody,
  RegisterRefundBody,
  ReturnSaleItemBody,
  SalesSummaryQuery,
  UpdateSaleBody,
  UpdateSaleItemBody,
} from './sales.schemas';

export interface SalesControllerDeps {
  readonly createSale: UseCaseOf<CreateSaleUseCase>;
  readonly updateSale: UseCaseOf<UpdateSaleUseCase>;
  readonly getSale: UseCaseOf<GetSaleUseCase>;
  readonly listSales: UseCaseOf<ListSalesUseCase>;
  readonly getSalesSummary: UseCaseOf<GetSalesSummaryUseCase>;
  readonly completeSale: UseCaseOf<CompleteSaleUseCase>;
  readonly cancelSale: UseCaseOf<CancelSaleUseCase>;
  readonly deleteSale: UseCaseOf<DeleteSaleUseCase>;
  readonly addSaleItem: UseCaseOf<AddSaleItemUseCase>;
  readonly updateSaleItem: UseCaseOf<UpdateSaleItemUseCase>;
  readonly removeSaleItem: UseCaseOf<RemoveSaleItemUseCase>;
  readonly returnSaleItem: UseCaseOf<ReturnSaleItemUseCase>;
  readonly registerSalePayment: UseCaseOf<RegisterSalePaymentUseCase>;
  readonly listSalePayments: UseCaseOf<ListSalePaymentsUseCase>;
  readonly registerRefund: UseCaseOf<RegisterRefundUseCase>;
}

export class SalesController {
  constructor(private readonly deps: SalesControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateSaleBody;
    const result = await this.deps.createSale.execute({
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateSaleBody;
    const result = await this.deps.updateSale.execute(
      compact({ saleId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getSale.execute({ saleId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListSalesQuery;
    const result = await this.deps.listSales.execute({
      filters: compact({
        search: query.search,
        clientId: query.clientId,
        vehicleId: query.vehicleId,
        salespersonId: query.salespersonId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  summary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as SalesSummaryQuery;
    const result = await this.deps.getSalesSummary.execute({
      filters: compact({
        clientId: query.clientId,
        salespersonId: query.salespersonId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
    });
    sendResult(res, next, result);
  };

  complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.completeSale.execute({ saleId: req.params.id as string });
    sendResult(res, next, result);
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.cancelSale.execute({ saleId: req.params.id as string });
    sendResult(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteSale.execute({ saleId: req.params.id as string });
    sendResult(res, next, result, 204);
  };

  // --- Lineas ---------------------------------------------------------------

  addItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as AddSaleItemBody;
    const result = await this.deps.addSaleItem.execute({
      saleId: req.params.id as string,
      ...body,
    });
    sendResult(res, next, result, 201);
  };

  updateItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateSaleItemBody;
    const result = await this.deps.updateSaleItem.execute({
      saleId: req.params.id as string,
      saleItemId: req.params.itemId as string,
      salePrice: body.salePrice,
    });
    sendResult(res, next, result);
  };

  removeItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.removeSaleItem.execute({
      saleId: req.params.id as string,
      saleItemId: req.params.itemId as string,
    });
    sendResult(res, next, result);
  };

  returnItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as ReturnSaleItemBody;
    const result = await this.deps.returnSaleItem.execute({
      saleId: req.params.id as string,
      saleItemId: req.params.itemId as string,
      reason: body.reason,
      destination: body.destination,
    });
    sendResult(res, next, result);
  };

  // --- Dinero ---------------------------------------------------------------

  listPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.listSalePayments.execute({ saleId: req.params.id as string });
    sendResult(res, next, result);
  };

  registerPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as RegisterPaymentBody;
    const result = await this.deps.registerSalePayment.execute({
      saleId: req.params.id as string,
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  registerRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as RegisterRefundBody;
    const result = await this.deps.registerRefund.execute({
      saleId: req.params.id as string,
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };
}
