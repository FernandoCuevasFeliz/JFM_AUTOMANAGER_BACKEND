import type { ActiveSession, NewRefreshToken, RefreshToken } from './refresh-token.entity';

export interface RefreshTokenRepository {
  create(data: NewRefreshToken): Promise<RefreshToken>;
  /** Busca por el hash del secreto; nunca se consulta por el token en claro. */
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<boolean>;
  /**
   * Revoca todas las sesiones vigentes de un usuario. Se usa al cerrar sesion
   * en todos los dispositivos y ante la deteccion de reutilizacion de un token.
   */
  revokeAllForUser(userId: string): Promise<number>;
  listActiveSessions(userId: string): Promise<ActiveSession[]>;
  /** Elimina tokens vencidos hace tiempo. Devuelve cuantos se borraron. */
  deleteExpiredBefore(cutoff: Date): Promise<number>;
}
