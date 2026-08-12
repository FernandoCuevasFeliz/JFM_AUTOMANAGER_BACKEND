import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { CancelReservationUseCase } from '../../../application/reservations/cancel-reservation.use-case';
import type { CreateReservationUseCase } from '../../../application/reservations/create-reservation.use-case';
import type { ExpireReservationsUseCase } from '../../../application/reservations/expire-reservations.use-case';
import type { GetReservationUseCase } from '../../../application/reservations/get-reservation.use-case';
import type { ListReservationsUseCase } from '../../../application/reservations/list-reservations.use-case';
import type { UpdateReservationUseCase } from '../../../application/reservations/update-reservation.use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  CreateReservationBody,
  ListReservationsQuery,
  UpdateReservationBody,
} from './reservations.schemas';

export interface ReservationsControllerDeps {
  readonly createReservation: UseCaseOf<CreateReservationUseCase>;
  readonly updateReservation: UseCaseOf<UpdateReservationUseCase>;
  readonly getReservation: UseCaseOf<GetReservationUseCase>;
  readonly listReservations: UseCaseOf<ListReservationsUseCase>;
  readonly cancelReservation: UseCaseOf<CancelReservationUseCase>;
  readonly expireReservations: UseCaseOf<ExpireReservationsUseCase>;
}

export class ReservationsController {
  constructor(private readonly deps: ReservationsControllerDeps) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateReservationBody;
    const result = await this.deps.createReservation.execute({
      ...body,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateReservationBody;
    const result = await this.deps.updateReservation.execute(
      compact({ reservationId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getReservation.execute({
      reservationId: req.params.id as string,
    });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListReservationsQuery;
    const result = await this.deps.listReservations.execute({
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

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.cancelReservation.execute({
      reservationId: req.params.id as string,
    });
    sendResult(res, next, result);
  };

  expire = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.expireReservations.execute(undefined);
    sendResult(res, next, result);
  };
}
