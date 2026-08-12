import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { CreateSupplierUseCase } from '../../../application/suppliers/create-supplier.use-case';
import type { DeleteSupplierUseCase } from '../../../application/suppliers/delete-supplier.use-case';
import type { GetSupplierUseCase } from '../../../application/suppliers/get-supplier.use-case';
import type { ListSuppliersUseCase } from '../../../application/suppliers/list-suppliers.use-case';
import type { UpdateSupplierUseCase } from '../../../application/suppliers/update-supplier.use-case';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  CreateSupplierBody,
  ListSuppliersQuery,
  UpdateSupplierBody,
} from './suppliers.schemas';

export interface SuppliersControllerDeps {
  readonly createSupplier: UseCaseOf<CreateSupplierUseCase>;
  readonly updateSupplier: UseCaseOf<UpdateSupplierUseCase>;
  readonly getSupplier: UseCaseOf<GetSupplierUseCase>;
  readonly listSuppliers: UseCaseOf<ListSuppliersUseCase>;
  readonly deleteSupplier: UseCaseOf<DeleteSupplierUseCase>;
}

export class SuppliersController {
  constructor(private readonly deps: SuppliersControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.createSupplier.execute(req.body as CreateSupplierBody);
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateSupplierBody;
    const result = await this.deps.updateSupplier.execute(
      compact({ supplierId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getSupplier.execute({ supplierId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListSuppliersQuery;
    const result = await this.deps.listSuppliers.execute({
      filters: compact({
        search: query.search,
        country: query.country,
        isActive: query.isActive,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteSupplier.execute({
      supplierId: req.params.id as string,
    });
    sendResult(res, next, result, 204);
  };
}
