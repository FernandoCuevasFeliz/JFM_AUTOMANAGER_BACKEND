import type { IncomingMessage, ServerResponse } from 'node:http';
import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { sql } from 'kysely';
import { env, isProduction } from '../infrastructure/config/env';
import { logger } from '../infrastructure/logging/logger';
import { errorHandler, notFoundHandler } from '../presentation/middlewares/error-handler';
import { getRequestOutcome } from '../presentation/middlewares/request-outcome';
import type { Container } from './container';
import { buildRouter } from './routes';

export const API_PREFIX = '/api/v1';

/**
 * Linea de acceso: una sola por peticion, legible de un vistazo.
 *
 *   GET /api/v1/vehicles 200 (12ms)
 *   POST /api/v1/vehicles 403 (4ms) FORBIDDEN: El rol "ventas" no tiene permiso...
 *
 * Cuando la peticion falla, el error-handler deja anotado el codigo y el
 * mensaje en la respuesta y se incluyen aqui, en lugar de emitir una segunda
 * linea de log para el error.
 */
function formatAccessLine(req: IncomingMessage, res: ServerResponse, responseTime?: number): string {
  const method = req.method ?? 'GET';
  // Express reescribe `req.url` al entrar en cada router montado, de modo que
  // al terminar la respuesta valdria `/` en lugar de `/api/v1/vehicles`.
  // `originalUrl` conserva la ruta tal como la pidio el cliente.
  const url = (req as Request).originalUrl ?? req.url ?? '/';
  const elapsed = responseTime === undefined ? '' : ` (${responseTime}ms)`;
  const outcome = getRequestOutcome(res);
  const detail = outcome === undefined ? '' : ` ${outcome.code}: ${outcome.message}`;

  return `${method} ${url} ${res.statusCode}${elapsed}${detail}`;
}

export function createApp(container: Container): Express {
  const app = express();

  // Detras de un proxy inverso (nginx, Railway, Render) `req.ip` debe salir de
  // X-Forwarded-For; de lo contrario la auditoria registraria siempre la IP del
  // proxy.
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');

  // El registro de acceso va PRIMERO, antes que cualquier otro middleware: si
  // se montara despues de `express.json()`, una peticion con el cuerpo mal
  // formado se rechazaria con 400 sin dejar rastro en el log.
  app.use(
    pinoHttp({
      logger,
      // Las peticiones correctas no necesitan una linea de log cada una en
      // produccion; los errores si.
      customLogLevel: (_req, res, error) => {
        if (error !== undefined || res.statusCode >= 500) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        return isProduction ? 'debug' : 'info';
      },
      customSuccessMessage: formatAccessLine,
      customErrorMessage: (req, res) => formatAccessLine(req, res),
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins === '*' ? true : env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  /** Liveness: el proceso responde. */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  /** Readiness: ademas, la base de datos contesta. */
  app.get('/health/ready', (_req, res) => {
    sql`select 1`
      .execute(container.db)
      .then(() => {
        res.json({ status: 'ok', database: 'up' });
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'La verificacion de la base de datos fallo');
        res.status(503).json({ status: 'error', database: 'down' });
      });
  });

  app.use(API_PREFIX, buildRouter(container));

  app.use(notFoundHandler());
  app.use(errorHandler(logger, !isProduction));

  return app;
}
