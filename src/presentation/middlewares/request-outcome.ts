import type { Response } from 'express';
import type { ServerResponse } from 'node:http';

/**
 * Resultado de negocio de una peticion, anotado por el error-handler para que
 * el log de acceso pueda incluirlo.
 *
 * Sin esto, una peticion fallida generaria dos lineas de log: la del error y la
 * del acceso. Anotando el codigo en la respuesta, el registro de acceso queda
 * como unica linea por peticion y aun asi dice que fallo.
 */
export interface RequestOutcome {
  readonly code: string;
  readonly message: string;
}

const OUTCOME_KEY = 'requestOutcome';

export function setRequestOutcome(res: Response, outcome: RequestOutcome): void {
  res.locals[OUTCOME_KEY] = outcome;
}

/**
 * `pino-http` entrega el `ServerResponse` de Node, que en Express siempre es la
 * misma instancia que el `Response` con `locals`; de ahi la conversion.
 */
export function getRequestOutcome(res: ServerResponse): RequestOutcome | undefined {
  const locals = (res as Response).locals as Record<string, unknown> | undefined;
  const outcome = locals?.[OUTCOME_KEY];

  if (
    typeof outcome === 'object' &&
    outcome !== null &&
    'code' in outcome &&
    'message' in outcome
  ) {
    return outcome as RequestOutcome;
  }

  return undefined;
}
