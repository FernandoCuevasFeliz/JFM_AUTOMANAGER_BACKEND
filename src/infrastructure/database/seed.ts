import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../logging/logger';
import { BcryptPasswordHasher } from '../auth/bcrypt-password-hasher';
import { createDatabase } from './connection';

/**
 * Semilla del usuario administrador inicial.
 *
 * Los catalogos (monedas, tipos de documento, metodos de pago, roles y
 * categorias de gasto) los carga la migracion 002. Este script solo crea la
 * primera cuenta con la que entrar al sistema, porque necesita bcrypt y por
 * tanto no puede vivir en una migracion SQL.
 *
 * Es idempotente: si el correo ya existe, no hace nada.
 */
const seedEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z.string().email('SEED_ADMIN_EMAIL debe ser un correo valido'),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(8, 'SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres'),
  SEED_ADMIN_FIRST_NAME: z.string().min(1).default('Administrador'),
  SEED_ADMIN_LAST_NAME: z.string().min(1).default('General'),
});

async function seed(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      'Faltan variables de entorno para el seed (ver .env.example)',
    );
    process.exit(1);
  }

  const config = parsed.data;
  const db = createDatabase();

  try {
    const adminRole = await db
      .selectFrom('roles')
      .select('id')
      .where('name', '=', 'admin')
      .executeTakeFirst();

    if (adminRole === undefined) {
      logger.error(
        'No existe el rol "admin". Ejecute primero las migraciones: npm run db:migrate',
      );
      process.exit(1);
    }

    const email = config.SEED_ADMIN_EMAIL.trim().toLowerCase();

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();

    if (existing !== undefined) {
      logger.info({ email }, 'El usuario administrador ya existe; no se hicieron cambios');
      return;
    }

    const passwordHash = await new BcryptPasswordHasher(env.BCRYPT_SALT_ROUNDS).hash(
      config.SEED_ADMIN_PASSWORD,
    );

    const created = await db
      .insertInto('users')
      .values({
        role_id: adminRole.id,
        first_name: config.SEED_ADMIN_FIRST_NAME,
        last_name: config.SEED_ADMIN_LAST_NAME,
        email,
        password_hash: passwordHash,
        phone: null,
        is_active: true,
      })
      .returning(['id', 'email'])
      .executeTakeFirstOrThrow();

    logger.info({ id: created.id, email: created.email }, 'Usuario administrador creado');
    logger.warn('Cambie la contrasena del administrador despues del primer inicio de sesion');
  } finally {
    await db.destroy();
  }
}

seed().catch((error: unknown) => {
  logger.error({ err: error }, 'El seed fallo');
  process.exit(1);
});
