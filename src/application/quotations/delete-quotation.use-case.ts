import {
  QuotationNotEditableError,
  QuotationNotFoundError,
} from '../../domain/quotations/quotation.errors';
import type { QuotationRepository } from '../../domain/quotations/quotation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeleteQuotationInput {
  readonly quotationId: string;
}

/**
 * Borrado logico. Una cotizacion ya convertida en reserva o venta no se borra:
 * es el origen documental de esa operacion.
 */
export class DeleteQuotationUseCase implements UseCase<DeleteQuotationInput, void> {
  constructor(private readonly quotations: QuotationRepository) {}

  async execute(input: DeleteQuotationInput): Promise<Result<void, DomainError>> {
    const quotation = await this.quotations.findById(input.quotationId);
    if (quotation === null) {
      return err(new QuotationNotFoundError(input.quotationId));
    }

    if (quotation.status === 'converted') {
      return err(new QuotationNotEditableError(quotation.status));
    }

    const deleted = await this.quotations.softDelete(input.quotationId);
    if (!deleted) {
      return err(new QuotationNotFoundError(input.quotationId));
    }

    return okVoid();
  }
}
