import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';

export interface ValidationSchemas {
  readonly body?: ZodTypeAny;
  readonly query?: ZodTypeAny;
  readonly params?: ZodTypeAny;
}

/**
 * Error de forma del request (400). No es un `DomainError`: describe que el
 * mensaje HTTP esta mal construido, no que se haya violado una regla de
 * negocio. Esa separacion es la que evita duplicar validaciones entre Zod y el
 * dominio: Zod comprueba tipos, formatos y obligatoriedad; el dominio, las
 * invariantes.
 */
export class RequestValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;

  constructor(readonly issues: { path: string; message: string }[]) {
    super('La solicitud contiene datos invalidos');
    this.name = 'RequestValidationError';
  }
}

/**
 * Valida y NORMALIZA `body`, `query` y `params`. El resultado parseado
 * reemplaza al original, de modo que el controlador recibe datos ya tipados y
 * con las coerciones aplicadas (numeros, booleanos, valores por defecto).
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: { path: string; message: string }[] = [];

    for (const source of ['body', 'query', 'params'] as const) {
      const schema = schemas[source];
      if (schema === undefined) {
        continue;
      }

      const result = schema.safeParse(req[source]);

      if (result.success) {
        // `req.query` y `req.params` son getters de solo lectura en Express 4
        // segun la version; se reasigna con defineProperty para no depender de
        // que el descriptor sea escribible.
        Object.defineProperty(req, source, {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        issues.push(...formatIssues(source, result.error));
      }
    }

    if (issues.length > 0) {
      next(new RequestValidationError(issues));
      return;
    }

    next();
  };
}

function formatIssues(source: string, error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: [source, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}
