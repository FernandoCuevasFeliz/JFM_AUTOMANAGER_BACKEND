/**
 * Error de dominio. NO es una excepcion de JavaScript: es un valor que viaja
 * dentro de un `Result`. Extiende `Error` unicamente para conservar el stack
 * cuando se registra en el log, nunca se hace `throw` de estos objetos desde
 * un caso de uso.
 *
 * `code` es un identificador estable, apto para que el frontend reaccione
 * (por ejemplo mostrando un mensaje especifico); `httpStatus` es la traduccion
 * a HTTP que aplica el error-handler.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  /** Datos adicionales que se exponen al cliente (campo en conflicto, etc.). */
  readonly details?: Record<string, unknown>;

  protected constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/** El recurso solicitado no existe (o esta borrado logicamente). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;

  constructor(resource: string, identifier?: string) {
    super(
      identifier === undefined
        ? `${resource} no encontrado`
        : `${resource} no encontrado: ${identifier}`,
      identifier === undefined ? undefined : { resource, identifier },
    );
  }
}

/** Se intenta crear/actualizar algo que choca con un unico ya existente. */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/** La operacion viola una regla de negocio (no es un problema de forma). */
export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly httpStatus = 422;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/** Credenciales invalidas o token ausente/expirado. */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;

  constructor(message = 'No autenticado') {
    super(message);
  }
}

/** Autenticado, pero sin permiso para la accion solicitada. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;

  constructor(message = 'No tiene permisos para realizar esta accion', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/** Referencia a una entidad de otro agregado que no existe. */
export class InvalidReferenceError extends DomainError {
  readonly code = 'INVALID_REFERENCE';
  readonly httpStatus = 422;

  constructor(resource: string, identifier: string) {
    super(`La referencia a ${resource} no es valida: ${identifier}`, { resource, identifier });
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
