import type { NextFunction, Response } from 'express';
import type { DomainError } from '../../../domain/shared/domain-error';
import type { PaginatedResult } from '../../../domain/shared/pagination';
import type { Result } from '../../../domain/shared/result';

/**
 * Envoltura uniforme de las respuestas: `{ data }` en exito, `{ error }` en
 * fallo (lo produce el error-handler). Los listados paginados agregan `meta`.
 */
export function sendResult<T>(
  res: Response,
  next: NextFunction,
  result: Result<T, DomainError>,
  successStatus = 200,
): void {
  if (!result.ok) {
    next(result.error);
    return;
  }

  if (successStatus === 204) {
    res.status(204).send();
    return;
  }

  res.status(successStatus).json({ data: result.value });
}

export function sendPaginated<T>(
  res: Response,
  next: NextFunction,
  result: Result<PaginatedResult<T>, DomainError>,
): void {
  if (!result.ok) {
    next(result.error);
    return;
  }

  const { items, ...meta } = result.value;
  res.status(200).json({ data: items, meta });
}
