import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileMigrationProvider, Migrator, type MigrationResultSet } from 'kysely';
import { createDatabase } from './connection';
import { logger } from '../logging/logger';

/**
 * Runner de migraciones.
 *
 *   npm run db:migrate         -> aplica todas las migraciones pendientes
 *   npm run db:migrate:down    -> revierte la ultima migracion aplicada
 *
 * Kysely lleva el control en dos tablas propias de infraestructura
 * (`kysely_migration` y `kysely_migration_lock`) que crea automaticamente.
 * No forman parte del modelo de negocio: son el registro de que migraciones
 * ya corrieron.
 */
async function run(): Promise<void> {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const db = createDatabase();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const { error, results }: MigrationResultSet =
    direction === 'up' ? await migrator.migrateToLatest() : await migrator.migrateDown();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      logger.info(`Migracion "${result.migrationName}" (${result.direction}) aplicada`);
    } else if (result.status === 'Error') {
      logger.error(`Fallo la migracion "${result.migrationName}" (${result.direction})`);
    }
  }

  if (!results || results.length === 0) {
    logger.info('No habia migraciones pendientes');
  }

  await db.destroy();

  if (error) {
    logger.error({ err: error }, 'El proceso de migracion fallo');
    process.exit(1);
  }
}

void run();
