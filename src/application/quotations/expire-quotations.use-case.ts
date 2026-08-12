import type { QuotationRepository } from '../../domain/quotations/quotation.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ExpireQuotationsOutput {
  readonly expired: number;
}

/**
 * Marca como vencidas las cotizaciones cuya validez ya paso. Pensado para
 * ejecutarse desde una tarea programada o desde el endpoint de mantenimiento;
 * el vencimiento tambien se respeta en tiempo real al intentar convertir una
 * cotizacion, asi que el sistema es correcto aunque este proceso no corra.
 */
export class ExpireQuotationsUseCase implements UseCase<void, ExpireQuotationsOutput> {
  constructor(
    private readonly quotations: QuotationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<ExpireQuotationsOutput, DomainError>> {
    const expired = await this.quotations.expireOverdue(this.clock.today());
    return ok({ expired });
  }
}
