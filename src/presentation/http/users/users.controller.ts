import type { NextFunction, Request, Response } from 'express';
import type { UseCaseOf } from '../../../application/shared/use-case';
import type { AuthenticateUserUseCase } from '../../../application/users/authenticate-user.use-case';
import type { ChangePasswordUseCase } from '../../../application/users/change-password.use-case';
import type { CreateUserUseCase } from '../../../application/users/create-user.use-case';
import type { DeleteUserUseCase } from '../../../application/users/delete-user.use-case';
import type { GetUserUseCase } from '../../../application/users/get-user.use-case';
import type { ListRolesUseCase } from '../../../application/users/list-roles.use-case';
import type { ListUsersUseCase } from '../../../application/users/list-users.use-case';
import type { UpdateUserUseCase } from '../../../application/users/update-user.use-case';
import { requireActorId } from '../../middlewares/auth.middleware';
import { compact, toPageQuery } from '../shared/common.schemas';
import { sendPaginated, sendResult } from '../shared/http-response';
import type {
  ChangePasswordBody,
  CreateUserBody,
  ListUsersQuery,
  LoginBody,
  ResetPasswordBody,
  UpdateUserBody,
} from './users.schemas';

export interface UsersControllerDeps {
  readonly authenticateUser: UseCaseOf<AuthenticateUserUseCase>;
  readonly createUser: UseCaseOf<CreateUserUseCase>;
  readonly updateUser: UseCaseOf<UpdateUserUseCase>;
  readonly getUser: UseCaseOf<GetUserUseCase>;
  readonly listUsers: UseCaseOf<ListUsersUseCase>;
  readonly deleteUser: UseCaseOf<DeleteUserUseCase>;
  readonly changePassword: UseCaseOf<ChangePasswordUseCase>;
  readonly listRoles: UseCaseOf<ListRolesUseCase>;
}

export class UsersController {
  constructor(private readonly deps: UsersControllerDeps) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as LoginBody;
    const result = await this.deps.authenticateUser.execute(body);
    sendResult(res, next, result);
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getUser.execute({ userId: requireActorId(req) });
    sendResult(res, next, result);
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateUserBody;
    const result = await this.deps.createUser.execute(body);
    sendResult(res, next, result, 201);
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as UpdateUserBody;
    const result = await this.deps.updateUser.execute(
      compact({ userId: req.params.id as string, ...body }),
    );
    sendResult(res, next, result);
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.getUser.execute({ userId: req.params.id as string });
    sendResult(res, next, result);
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query as unknown as ListUsersQuery;
    const result = await this.deps.listUsers.execute({
      filters: compact({
        search: query.search,
        roleId: query.roleId,
        isActive: query.isActive,
      }),
      page: toPageQuery(query),
    });
    sendPaginated(res, next, result);
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.deleteUser.execute({
      userId: req.params.id as string,
      actorUserId: requireActorId(req),
    });
    sendResult(res, next, result, 204);
  };

  /** Cambio de la propia contrasena: exige la actual. */
  changeOwnPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as ChangePasswordBody;
    const result = await this.deps.changePassword.execute({
      userId: requireActorId(req),
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    sendResult(res, next, result, 204);
  };

  /** Restablecimiento por un administrador: no requiere la contrasena actual. */
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as ResetPasswordBody;
    const result = await this.deps.changePassword.execute({
      userId: req.params.id as string,
      currentPassword: null,
      newPassword: body.newPassword,
    });
    sendResult(res, next, result, 204);
  };

  roles = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await this.deps.listRoles.execute(undefined);
    sendResult(res, next, result);
  };
}
