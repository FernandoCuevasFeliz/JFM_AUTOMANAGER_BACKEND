import type { Server } from 'node:http';
import { env } from '../infrastructure/config/env';
import { logger } from '../infrastructure/logging/logger';
import { API_PREFIX, createApp } from './app';
import { buildContainer } from './container';

/**
 * Punto de entrada. Levanta el servidor y se encarga del apagado ordenado:
 * deja de aceptar conexiones, espera a que terminen las peticiones en curso y
 * recien entonces cierra el pool de Postgres.
 */
function main(): void {
  const container = buildContainer();
  const app = createApp(container);

  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      `JFM AutoManager backend escuchando en http://localhost:${env.PORT}${API_PREFIX} [${env.NODE_ENV}]`,
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Apagando el servidor');

    server.close((error) => {
      if (error !== undefined) {
        logger.error({ err: error }, 'Error al cerrar el servidor HTTP');
      }

      container
        .shutdown()
        .then(() => {
          logger.info('Conexiones cerradas. Hasta luego');
          process.exit(error === undefined ? 0 : 1);
        })
        .catch((shutdownError: unknown) => {
          logger.error({ err: shutdownError }, 'Error al cerrar la conexion a la base de datos');
          process.exit(1);
        });
    });

    // Red de seguridad: si algo queda colgado, no esperar indefinidamente.
    setTimeout(() => {
      logger.error('El apagado ordenado excedio el tiempo limite; forzando salida');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Promesa rechazada sin manejar');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Excepcion no capturada');
    shutdown('uncaughtException');
  });
}

main();
