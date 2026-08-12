import pino from 'pino';
import { env, isProduction } from '../config/env';

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
  ...(isProduction
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
