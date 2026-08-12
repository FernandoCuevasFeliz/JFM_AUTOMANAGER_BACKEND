/**
 * Result explicito para errores de negocio esperados.
 *
 * Los casos de uso NO lanzan excepciones para reglas de negocio: devuelven
 * `Result<T, DomainError>`. Las excepciones quedan reservadas para fallos
 * realmente inesperados (la base de datos se cayo, un bug), que el
 * `error-handler` traduce a 500.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Azucar para `void` sin tener que escribir `ok(undefined)`. */
export const okVoid = (): Ok<void> => ok(undefined);
