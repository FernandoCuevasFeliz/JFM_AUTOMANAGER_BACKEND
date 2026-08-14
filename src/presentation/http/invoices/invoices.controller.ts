import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { CancelInvoiceUseCase } from '../../../application/invoices/cancel-invoice.use-case';
import type { CreateCreditNoteUseCase } from '../../../application/invoices/create-credit-note.use-case';
import type { CreateInvoiceUseCase } from '../../../application/invoices/create-invoice.use-case';
import type {
  GetInvoiceBySaleUseCase,
  GetInvoiceUseCase,
} from '../../../application/invoices/get-invoice.use-case';
import type {
  IssueCreditNoteUseCase,
  RejectCreditNoteUseCase,
} from '../../../application/invoices/issue-credit-note.use-case';
import type { IssueInvoiceUseCase } from '../../../application/invoices/issue-invoice.use-case';
import type { ListInvoicesUseCase } from '../../../application/invoices/list-invoices.use-case';
import type {
  RejectInvoiceUseCase,
  RetryInvoiceUseCase,
} from '../../../application/invoices/reject-invoice.use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  CreateCreditNoteBody,
  CreateInvoiceBody,
  IssueCreditNoteBody,
  IssueInvoiceBody,
  ListInvoicesQuery,
  RejectInvoiceBody,
} from './invoices.schemas';

export interface InvoicesControllerDeps {
  readonly createInvoice: UseCaseOf<CreateInvoiceUseCase>;
  readonly issueInvoice: UseCaseOf<IssueInvoiceUseCase>;
  readonly rejectInvoice: UseCaseOf<RejectInvoiceUseCase>;
  readonly retryInvoice: UseCaseOf<RetryInvoiceUseCase>;
  readonly cancelInvoice: UseCaseOf<CancelInvoiceUseCase>;
  readonly getInvoice: UseCaseOf<GetInvoiceUseCase>;
  readonly getInvoiceBySale: UseCaseOf<GetInvoiceBySaleUseCase>;
  readonly listInvoices: UseCaseOf<ListInvoicesUseCase>;
  readonly createCreditNote: UseCaseOf<CreateCreditNoteUseCase>;
  readonly issueCreditNote: UseCaseOf<IssueCreditNoteUseCase>;
  readonly rejectCreditNote: UseCaseOf<RejectCreditNoteUseCase>;
}

export class InvoicesController {
  constructor(private readonly deps: InvoicesControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateInvoiceBody;
    const result = await this.deps.createInvoice.execute({
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getInvoice.execute({ invoiceId: req.params.id as string });
    sendResult(res, next, result);
  };

  getBySale = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getInvoiceBySale.execute({
      saleId: req.params.saleId as string,
    });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListInvoicesQuery;
    const result = await this.deps.listInvoices.execute({
      filters: compact({
        search: query.search,
        status: query.status,
        ncfType: query.ncfType,
        clientId: query.clientId,
        saleId: query.saleId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  issue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as IssueInvoiceBody;
    const result = await this.deps.issueInvoice.execute({
      invoiceId: req.params.id as string,
      ...body,
    });
    sendResult(res, next, result);
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as RejectInvoiceBody;
    const result = await this.deps.rejectInvoice.execute({
      invoiceId: req.params.id as string,
      reason: body.reason,
    });
    sendResult(res, next, result);
  };

  retry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.retryInvoice.execute({ invoiceId: req.params.id as string });
    sendResult(res, next, result);
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.cancelInvoice.execute({ invoiceId: req.params.id as string });
    sendResult(res, next, result);
  };

  // --- Notas de credito ----------------------------------------------------

  createCreditNoteHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const body = req.body as CreateCreditNoteBody;
    const result = await this.deps.createCreditNote.execute({
      invoiceId: req.params.id as string,
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  issueCreditNoteHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const body = req.body as IssueCreditNoteBody;
    const result = await this.deps.issueCreditNote.execute({
      invoiceId: req.params.id as string,
      creditNoteId: req.params.creditNoteId as string,
      ...body,
    });
    sendResult(res, next, result);
  };

  rejectCreditNoteHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const result = await this.deps.rejectCreditNote.execute({
      invoiceId: req.params.id as string,
      creditNoteId: req.params.creditNoteId as string,
    });
    sendResult(res, next, result);
  };
}
