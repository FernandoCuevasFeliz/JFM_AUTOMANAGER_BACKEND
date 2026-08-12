import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type {
  ActiveSession,
  NewRefreshToken,
  RefreshToken,
} from '../../domain/users/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/users/refresh-token.repository';
import type { Executor } from '../database/connection';
import type { RefreshTokensTable } from '../database/database.types';
import { toDate, toNullableDate } from './mappers';

function mapRefreshToken(row: Selectable<RefreshTokensTable>): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: toDate(row.expires_at),
    revokedAt: toNullableDate(row.revoked_at),
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export class KyselyRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: Executor) {}

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const row = await this.db
      .insertInto('refresh_tokens')
      .values({
        user_id: data.userId,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
        user_agent: data.userAgent,
        ip_address: data.ipAddress,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapRefreshToken(row);
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.db
      .selectFrom('refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    return row === undefined ? null : mapRefreshToken(row);
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('refresh_tokens')
      .set({ revoked_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.db
      .updateTable('refresh_tokens')
      .set({ revoked_at: sql<Date>`now()` })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  async listActiveSessions(userId: string): Promise<ActiveSession[]> {
    const rows = await this.db
      .selectFrom('refresh_tokens')
      .select(['id', 'user_agent', 'ip_address', 'created_at', 'expires_at'])
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', sql<Date>`now()`)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      createdAt: toDate(row.created_at),
      expiresAt: toDate(row.expires_at),
    }));
  }

  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('refresh_tokens')
      .where('expires_at', '<', cutoff)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }
}
