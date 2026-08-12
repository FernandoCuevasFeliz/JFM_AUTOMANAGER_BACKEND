/**
 * Utilidades compartidas por los mappers de los repositorios.
 *
 * Los mappers son la frontera entre `snake_case` (base de datos) y `camelCase`
 * (dominio). Ninguna fila cruda debe salir de `infrastructure/`.
 */

/** Convierte a number lo que Postgres pueda devolver como string. */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

export function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  return toDate(value);
}

/** `%texto%` escapando los comodines de LIKE que venga en la busqueda. */
export function likePattern(search: string): string {
  const escaped = search.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
  return `%${escaped}%`;
}

/** Redondeo monetario a 2 decimales. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** `true` si el objeto no tiene ninguna clave (update vacio). */
export function isEmptyPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length === 0;
}
