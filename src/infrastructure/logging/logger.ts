import pino from 'pino';
import { env, isProduction } from '../config/env';

/**
 * `pino-pretty` es una dependencia de DESARROLLO: no existe en la imagen de
 * produccion. Pino resuelve el transporte de forma perezosa y lanza si no lo
 * encuentra, asi que basta con que `NODE_ENV` llegue con otro valor al
 * contenedor (por ejemplo, pegando un `.env` local en el panel de la
 * plataforma) para que el proceso muera al arrancar.
 *
 * Comprobar que el modulo se puede resolver convierte eso en una degradacion
 * silenciosa a JSON: el formato del log es una comodidad de desarrollo y jamas
 * debe ser motivo de que la API no levante.
 */
function isPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty = !isProduction && isPrettyAvailable();

/**
 * Logger raiz de la aplicacion. En desarrollo usa `pino-pretty` para salida
 * legible; en produccion emite JSON en una sola linea (apto para agregadores).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'jfm-automanager-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[REDACTED]',
  },
  ...(!usePretty
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            /**
             * En el terminal se muestra solo hora, nivel y mensaje.
             *
             * `pino-http` adjunta los objetos `req` y `res` completos (cabeceras
             * incluidas), que ocupan decenas de lineas por peticion; su
             * contenido util ya va resumido en el mensaje de acceso. Se ocultan
             * unicamente en la salida legible: en produccion la salida es JSON
             * y conserva todos los campos para el agregador de logs.
             */
            ignore: 'pid,hostname,service,req,res,responseTime,reqId',
          },
        },
      }),
});

export type Logger = typeof logger;
