import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import { CannotDeleteSelfError, UserNotFoundError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface DeleteUserInput extends ActorInput {
  readonly userId: string;
}

/**
 * Borrado logico. `users` esta referenciada con RESTRICT desde compras,
 * gastos, cotizaciones, reservas y ventas, asi que nunca se borra fisicamente:
 * eso destruiria la trazabilidad de quien registro cada operacion.
 */
export class DeleteUserUseCase implements UseCase<DeleteUserInput, void> {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: DeleteUserInput): Promise<Result<void, DomainError>> {
    if (input.userId === input.actorUserId) {
      return err(new CannotDeleteSelfError());
    }

    const existing = await this.users.findById(input.userId);
    if (existing === null) {
      return err(new UserNotFoundError(input.userId));
    }

    const deleted = await this.users.softDelete(input.userId);
    if (!deleted) {
      return err(new UserNotFoundError(input.userId));
    }

    // Sin esto, el usuario dado de baja podria seguir renovando su sesion
    // hasta que venciera el refresh token.
    await this.refreshTokens.revokeAllForUser(input.userId);

    return okVoid();
  }
}
