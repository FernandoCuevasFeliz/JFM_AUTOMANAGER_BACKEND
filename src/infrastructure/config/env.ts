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

/**
 * Diagnostico para cuando la configuracion falla en un despliegue.
 *
 * Distingue las tres causas que se confunden entre si desde los logs:
 *   - no llego NINGUNA variable  -> se configuraron en otro servicio o en otro
 *     entorno del panel;
 *   - llego alguna pero no la que falta -> el nombre tiene una errata;
 *   - llego con un nombre parecido -> lo senala explicitamente.
 *
 * Solo se imprimen NOMBRES y longitudes, nunca valores: este texto acaba en los
 * logs de la plataforma, que suelen ser legibles por todo el equipo.
 */
function describeReceivedEnv(): string {
  const esperadas = Object.keys(envSchema.shape);
  const recibidas = Object.keys(process.env);

  const presentes = esperadas.filter((name) => {
    const value = process.env[name];
    return value !== undefined && value !== '';
  });

  const lineas = [
    'Diagnostico (solo nombres, sin valores):',
    `  - variables recibidas por el proceso: ${recibidas.length}`,
    `  - reconocidas por la app: ${presentes.length === 0 ? '(ninguna)' : presentes.join(', ')}`,
  ];

  // Nombres parecidos a los esperados: delatan erratas y variantes en minusculas.
  const parecidas = recibidas.filter((name) => {
    if (esperadas.includes(name)) {
      return false;
    }
    const normalizado = name.toUpperCase().replace(/[^A-Z]/g, '');
    return esperadas.some((e) => e.replace(/[^A-Z]/g, '') === normalizado);
  });

  if (parecidas.length > 0) {
    lineas.push(`  - OJO, nombres parecidos pero distintos: ${parecidas.join(', ')}`);
  }

  if (presentes.length === 0) {
    lineas.push(
      '  - No llego ninguna variable de la aplicacion. Revise que esten',
      '    definidas en ESTE servicio y en ESTE entorno del panel.',
    );
  }

  return lineas.join('\n');
}

function buildEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    // Se escribe el diagnostico y se sale con codigo 1 en lugar de lanzar. Un
    // `throw` aqui ocurre al cargar el modulo, asi que Node imprime un stack
    // trace de su cargador de modulos que no aporta nada (el fallo no esta en
    // el codigo, sino en la configuracion) y que en plataformas como Railway
    // aparece entrelazado con la salida de otros procesos, enterrando el unico
    // dato util: que variable falta.
    process.stderr.write(
      [
        '',
        'No se pudo iniciar: la configuracion de entorno es invalida.',
        '',
        detail,
        '',
        'Defina esas variables en el entorno del proceso. En un despliegue',
        '(Railway, Render, Fly...) se configuran en el panel del servicio: el',
        'archivo .env NO viaja dentro de la imagen. Ver .env.example.',
        '',
        describeReceivedEnv(),
        '',
      ].join('\n'),
    );

    process.exit(1);
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
