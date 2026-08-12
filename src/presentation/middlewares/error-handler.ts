import type { ErrorRequestHandler, RequestHandler } from 'express';
import { isDomainError } from '../../domain/shared/domain-error';
import type { Logger } from '../../infrastructure/logging/logger';
import { setRequestOutcome } from './request-outcome';
import { RequestValidationError } from './validate.middleware';

/** Cuerpo de error uniforme para toda la API. */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Traduce errores a HTTP. Es el unico lugar del sistema que decide codigos de
 * estado.
 *
 *   - `DomainError`         -> su propio `httpStatus` (404, 409, 422, 401, 403)
 *   - `RequestValidationError` -> 400 con el detalle de los campos
 *   - cualquier otra cosa   -> 500 sin filtrar el mensaje interno al cliente
 *
 * En produccion el mensaje de los 500 se sustituye por uno generico: los
 * errores de la base de datos suelen incluir nombres de tablas y fragmentos de
 * SQL que no deben salir de la aplicacion.
 */
export function errorHandler(logger: Logger, exposeInternalErrors: boolean): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (isDomainError(error)) {
      // No se emite una linea de log propia: un 404 o un 409 son parte del
      // funcionamiento normal y su codigo viaja en el registro de acceso, que
      // deja una sola linea por peticion.
      setRequestOutcome(res, { code: error.code, message: error.message });

      const body: ErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };

      res.status(error.httpStatus).json(body);
      return;
    }

    if (error instanceof RequestValidationError) {
      setRequestOutcome(res, {
        code: error.code,
        message: error.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
      });

      const body: ErrorBody = {
        error: { code: error.code, message: error.message, details: error.issues },
      };
      res.status(error.httpStatus).json(body);
      return;
    }

    if (error instanceof SyntaxError && 'body' in error) {
      setRequestOutcome(res, {
        code: 'MALFORMED_JSON',
        message: 'El cuerpo de la peticion no es un JSON valido',
      });

      res.status(400).json({
        error: { code: 'MALFORMED_JSON', message: 'El cuerpo de la peticion no es un JSON valido' },
      });
      return;
    }

    setRequestOutcome(res, { code: 'INTERNAL_ERROR', message: String(error) });

    // Los fallos inesperados si merecen su propia linea: es la unica forma de
    // conservar el stack trace.
    logger.error(
      { err: error },
      `Error no controlado en ${req.method} ${req.originalUrl}`,
    );

    const body: ErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: exposeInternalErrors && error instanceof Error
          ? error.message
          : 'Ocurrio un error inesperado. Intente de nuevo o contacte al administrador',
      },
    };

    res.status(500).json(body);
  };
}

/** 404 para rutas inexistentes. Se monta al final de la cadena. */
export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    setRequestOutcome(res, { code: 'ROUTE_NOT_FOUND', message: 'La ruta no existe' });

    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No existe el recurso ${req.method} ${req.originalUrl}`,
      },
    });
  };
}
