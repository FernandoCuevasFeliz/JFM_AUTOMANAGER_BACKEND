import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { PasswordHasher } from '../../domain/users/password-hasher';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import {
  InvalidCredentialsError,
  SamePasswordError,
  UserNotFoundError,
} from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface ChangePasswordInput {
  readonly userId: string;
  /**
   * Contrasena actual. Obligatoria cuando el propio usuario cambia su clave;
   * `null` cuando un administrador la restablece (el control de que quien
   * llama es admin lo hace el middleware de permisos, no este caso de uso).
   */
  readonly currentPassword: string | null;
  readonly newPassword: string;
}

export class ChangePasswordUseCase implements UseCase<ChangePasswordInput, void> {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: ChangePasswordInput): Promise<Result<void, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (user === null) {
      return err(new UserNotFoundError(input.userId));
    }

    if (input.currentPassword !== null) {
      const matches = await this.passwordHasher.compare(input.currentPassword, user.passwordHash);
      if (!matches) {
        return err(new InvalidCredentialsError());
      }
    }

    const isSamePassword = await this.passwordHasher.compare(input.newPassword, user.passwordHash);
    if (isSamePassword) {
      return err(new SamePasswordError());
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.users.update(input.userId, { passwordHash });

    // Cambiar la contrasena cierra la sesion en todos los dispositivos: si el
    // motivo del cambio es que alguien la conocia, dejar sus sesiones abiertas
    // haria inutil el cambio.
    await this.refreshTokens.revokeAllForUser(input.userId);

    return okVoid();
  }
}
