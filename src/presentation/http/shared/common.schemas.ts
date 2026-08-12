import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../domain/shared/pagination';

/** UUID de un recurso en la ruta (`/vehicles/:id`). */
export const uuidParam = (name = 'id') =>
  z.object({ [name]: z.string().uuid('Identificador invalido') });

export const uuid = z.string().uuid('Identificador invalido');

/** Fecha civil `YYYY-MM-DD`, tal como la guardan las columnas DATE. */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'La fecha no es valida');

/** Monto monetario: NUMERIC(12,2), no negativo. */
export const money = z
  .number()
  .finite('El monto no es un numero valido')
  .nonnegative('El monto no puede ser negativo')
  .max(9_999_999_999.99, 'El monto excede el maximo permitido');

/** Monto que ademas debe ser mayor que cero (CHECK amount > 0 en la base). */
export const positiveMoney = money.gt(0, 'El monto debe ser mayor que cero');

/** Tasa de cambio: NUMERIC(10,4). */
export const exchangeRate = z
  .number()
  .gt(0, 'La tasa de cambio debe ser mayor que cero')
  .max(999_999.9999, 'La tasa de cambio excede el maximo permitido');

/** Texto opcional que se normaliza a `null` cuando llega vacio. */
export const nullableString = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar los ${max} caracteres`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value));

export const requiredString = (max: number, field = 'El campo') =>
  z.string().trim().min(1, `${field} es obligatorio`).max(max, `No puede superar los ${max} caracteres`);

/** Booleano que llega como string en la query (`?isActive=true`). */
export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/** Paginacion comun a todos los listados. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

/** Extrae `{ page, pageSize }` de una query ya validada. */
export function toPageQuery(query: PaginationQuery): { page: number; pageSize: number } {
  return { page: query.page, pageSize: query.pageSize };
}

/**
 * Quita las claves `undefined` de un objeto.
 *
 * Los casos de uso distinguen "no enviado" (`undefined`) de "poner a null", asi
 * que las actualizaciones parciales se construyen omitiendo lo ausente en vez
 * de mandarlo explicitamente.
 */
export function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
