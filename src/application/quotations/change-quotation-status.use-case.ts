import {
  canTransitionQuotationTo,
  type QuotationStatus,
  type QuotationWithDetails,
} from '../../domain/quotations/quotation.entity';
import {
  InvalidQuotationStatusTransitionError,
  QuotationNotFoundError,
} from '../../domain/quotations/quotation.errors';
import type { QuotationRepository } from '../../domain/quotations/quotation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

/** Estados que el usuario puede fijar a mano. `converted` lo pone el sistema. */
export type ManualQuotationStatus = Exclude<QuotationStatus, 'converted'>;

export interface ChangeQuotationStatusInput {
  readonly quotationId: string;
  readonly status: ManualQuotationStatus;
}

/**
 * Aprobacion, rechazo o vencimiento manual de una cotizacion.
 *
 * `converted` queda fuera del tipo de entrada a proposito: una cotizacion pasa
 * a convertida unicamente cuando se crea la reserva o la venta que nace de
 * ella, dentro de esa misma transaccion.
 */
export class ChangeQuotationStatusUseCase
  implements UseCase<ChangeQuotationStatusInput, QuotationWithDetails>
{
  constructor(private readonly quotations: QuotationRepository) {}

  async execute(
    input: ChangeQuotationStatusInput,
  ): Promise<Result<QuotationWithDetails, DomainError>> {
    const quotation = await this.quotations.findById(input.quotationId);
    if (quotation === null) {
      return err(new QuotationNotFoundError(input.quotationId));
    }

    if (!canTransitionQuotationTo(quotation.status, input.status)) {
      return err(new InvalidQuotationStatusTransitionError(quotation.status, input.status));
    }

    await this.quotations.updateStatus(input.quotationId, input.status);

    const updated = await this.quotations.findByIdWithDetails(input.quotationId);
    if (updated === null) {
      return err(new QuotationNotFoundError(input.quotationId));
    }

    return ok(updated);
  }
}
