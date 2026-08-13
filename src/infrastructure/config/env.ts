import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * Esquema de variables de entorno. Se valida una unica vez al arrancar el
 * proceso: si falta algo o esta mal formado, el servidor no levanta.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_ISSUER: z.string().default('jfm-automanager'),

  /** Vigencia del refresh token, en dias. Define cuanto dura la sesion. */
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive().max(365).default(30),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  CORS_ORIGINS: z.string().default('*'),

  // --- ImageKit -------------------------------------------------------------
  // El backend sigue sin recibir archivos: el navegador los sube directamente
  // a ImageKit y aqui solo se guarda la URL resultante. Pero esa subida exige
  // una firma calculada con la clave PRIVADA, que no puede viajar al cliente,
  // asi que el servidor expone `GET /uploads/imagekit-auth` para generarla.
  //
  // Ambas claves son opcionales: sin ellas el endpoint responde un error
  // explicito y el frontend cae solo a su modo "pegar URL".
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  IMAGEKIT_PUBLIC_KEY: z.string().optional(),

  /** Vigencia de la firma, en segundos. ImageKit no acepta mas de una hora. */
  IMAGEKIT_AUTH_EXPIRY_SECONDS: z.coerce.number().int().positive().max(3600).default(2400),
});

export type Env = z.infer<typeof envSchema> & { corsOrigins: string[] | '*' };

function buildEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno invalidas:\n${detail}`);
  }

  const raw = parsed.data;
  const corsOrigins =
    raw.CORS_ORIGINS.trim() === '*'
      ? ('*' as const)
      : raw.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0);

  return { ...raw, corsOrigins };
}

export const env: Env = buildEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
