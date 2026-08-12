/** Parametros de paginacion normalizados que reciben los repositorios. */
export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
}

export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  query: PageQuery,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 0,
  };
}

export function toOffset(query: PageQuery): number {
  return (query.page - 1) * query.pageSize;
}
