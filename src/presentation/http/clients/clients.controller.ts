import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { CreateClientUseCase } from '../../../application/clients/create-client.use-case';
import type { DeleteClientUseCase } from '../../../application/clients/delete-client.use-case';
import type { GetClientUseCase } from '../../../application/clients/get-client.use-case';
import type { ListClientsUseCase } from '../../../application/clients/list-clients.use-case';
import type { UpdateClientUseCase } from '../../../application/clients/update-client.use-case';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type { CreateClientBody, ListClientsQuery, UpdateClientBody } from './clients.schemas';

export interface ClientsControllerDeps {
  readonly createClient: UseCaseOf<CreateClientUseCase>;
  readonly updateClient: UseCaseOf<UpdateClientUseCase>;
  readonly getClient: UseCaseOf<GetClientUseCase>;
  readonly listClients: UseCaseOf<ListClientsUseCase>;
  readonly deleteClient: UseCaseOf<DeleteClientUseCase>;
}

export class ClientsController {
  constructor(private readonly deps: ClientsControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.createClient.execute(req.body as CreateClientBody);
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateClientBody;
    const result = await this.deps.updateClient.execute(
      compact({ clientId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getClient.execute({ clientId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListClientsQuery;
    const result = await this.deps.listClients.execute({
      filters: compact({
        search: query.search,
        clientType: query.clientType,
        city: query.city,
        isActive: query.isActive,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteClient.execute({ clientId: req.params.id as string });
    sendResult(res, next, result, 204);
  };
}
