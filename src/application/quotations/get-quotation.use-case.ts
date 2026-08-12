import type { QuotationWithDetails } from '../../domain/quotations/quotation.entity';
import { QuotationNotFoundError } from '../../domain/quotations/quotation.errors';
import type { QuotationRepository } from '../../domain/quotations/quotation.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetQuotationInput {
  readonly quotationId: string;
}

export class GetQuotationUseCase implements UseCase<GetQuotationInput, QuotationWithDetails> {
  constructor(private readonly quotations: QuotationRepository) {}

  async execute(input: GetQuotationInput): Promise<Result<QuotationWithDetails, DomainError>> {
    const quotation = await this.quotations.findByIdWithDetails(input.quotationId);
    if (quotation === null) {
      return err(new QuotationNotFoundError(input.quotationId));
    }
    return ok(quotation);
  }
}
