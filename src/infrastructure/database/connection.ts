import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../logging/logger';
import { configurePgTypeParsers } from './pg-types';
import type { DB } from './database.types';

configurePgTypeParsers();

/**
 * Un `Executor` es cualquier cosa capaz de ejecutar queries: la instancia raiz
 * de Kysely o una transaccion. Los repositorios reciben un `Executor`, lo que
 * les permite participar de una transaccion sin cambiar de implementacion.
 */
export type Executor = Kysely<DB> | Transaction<DB>;

export function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  });

  pool.on('error', (error) => {
    logger.error({ err: error }, 'Error inesperado en un cliente inactivo del pool de Postgres');
  });

  return pool;
}

export function createDatabase(pool: Pool = createPool()): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    log: (event) => {
      if (event.level === 'error') {
        logger.error(
          { err: event.error, sql: event.query.sql, durationMs: event.queryDurationMillis },
          'Fallo la ejecucion de una consulta SQL',
        );
        return;
      }
      logger.trace({ sql: event.query.sql, durationMs: event.queryDurationMillis }, 'SQL');
    },
  });
}

export type Database = Kysely<DB>;
