import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { ActiveSession, ManagedSession } from '../../domain/users/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import type { ActorInput, UseCase } from '../shared/use-case';

export type ListActiveSessionsInput = ActorInput;

/** Sesiones abiertas del propio usuario, para que reconozca sus dispositivos. */
export class ListActiveSessionsUseCase
  implements UseCase<ListActiveSessionsInput, ActiveSession[]>
{
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  async execute(input: ListActiveSessionsInput): Promise<Result<ActiveSession[], DomainError>> {
    return ok(await this.refreshTokens.listActiveSessions(input.actorUserId));
  }
}

export type LogoutAllSessionsInput = ActorInput;

export interface LogoutAllSessionsOutput {
  readonly revoked: number;
}

/**
 * Cierra la sesion en todos los dispositivos. Es la accion que debe ejecutar un
 * usuario que sospecha que le robaron la contrasena.
 */
export class LogoutAllSessionsUseCase
  implements UseCase<LogoutAllSessionsInput, LogoutAllSessionsOutput>
{
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  async execute(
    input: LogoutAllSessionsInput,
  ): Promise<Result<LogoutAllSessionsOutput, DomainError>> {
    return ok({ revoked: await this.refreshTokens.revokeAllForUser(input.actorUserId) });
  }
}

export class ListAllActiveSessionsUseCase implements UseCase<void, ManagedSession[]> {
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  async execute(): Promise<Result<ManagedSession[], DomainError>> {
    return ok(await this.refreshTokens.listAllActiveSessions());
  }
}

export interface RevokeSessionInput {
  readonly sessionId: string;
}

export class RevokeSessionUseCase implements UseCase<RevokeSessionInput, void> {
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  async execute(input: RevokeSessionInput): Promise<Result<void, DomainError>> {
    await this.refreshTokens.revoke(input.sessionId);
    return ok(undefined);
  }
}

export interface RevokeUserSessionsInput {
  readonly userId: string;
}

export class RevokeUserSessionsUseCase
  implements UseCase<RevokeUserSessionsInput, LogoutAllSessionsOutput>
{
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  async execute(
    input: RevokeUserSessionsInput,
  ): Promise<Result<LogoutAllSessionsOutput, DomainError>> {
    return ok({ revoked: await this.refreshTokens.revokeAllForUser(input.userId) });
  }
}
