import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Envuelve un handler asincrono para que un rechazo de promesa llegue al
 * manejador de errores de Express.
 *
 * Express 4 no captura promesas rechazadas: sin esto, un fallo inesperado
 * dentro de un controlador `async` dejaria la peticion colgada hasta el
 * timeout del cliente.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
