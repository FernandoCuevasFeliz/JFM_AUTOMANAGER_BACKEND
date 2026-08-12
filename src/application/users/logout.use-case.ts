import type { DomainError } from '../../domain/shared/domain-error';
import { okVoid, type Result } from '../../domain/shared/result';
import type { RefreshTokenGenerator } from '../../domain/users/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import type { UseCase } from '../shared/use-case';

export interface LogoutInput {
  readonly refreshToken: string;
}

/**
 * Cierra la sesion actual revocando su refresh token.
 *
 * Siempre responde bien, incluso si el token no existe o ya estaba revocado:
 * un cierre de sesion no debe informar a quien lo intenta de si el token que
 * presento era valido, y ademas repetir la operacion no es un error.
 *
 * El access token que ya se emitio sigue siendo valido hasta que expire: un JWT
 * firmado no se puede invalidar. De ahi la vigencia corta de `JWT_EXPIRES_IN`.
 */
export class LogoutUseCase implements UseCase<LogoutInput, void> {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly generator: RefreshTokenGenerator,
  ) {}

  async execute(input: LogoutInput): Promise<Result<void, DomainError>> {
    const stored = await this.refreshTokens.findByHash(this.generator.hash(input.refreshToken));

    if (stored !== null) {
      await this.refreshTokens.revoke(stored.id);
    }

    return okVoid();
  }
}
