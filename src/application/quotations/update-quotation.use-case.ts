import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import { CurrencyNotFoundError } from '../../domain/catalogs/catalog.errors';
import {
  isQuotationEditable,
  type QuotationWithDetails,
} from '../../domain/quotations/quotation.entity';
import {
  QuotationNotEditableError,
  QuotationNotFoundError,
  QuotationValidityDateError,
} from '../../domain/quotations/quotation.errors';
import type { QuotationRepository } from '../../domain/quotations/quotation.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface UpdateQuotationInput {
  readonly quotationId: string;
  readonly currencyId?: string;
  readonly quotedPrice?: number;
  readonly validUntil?: string;
  readonly notes?: string | null;
}

/**
 * Ajuste de precio o vigencia de una cotizacion abierta. No se permite cambiar
 * cliente ni vehiculo: eso es una cotizacion distinta.
 */
export class UpdateQuotationUseCase
  implements UseCase<UpdateQuotationInput, QuotationWithDetails>
{
  constructor(
    private readonly quotations: QuotationRepository,
    private readonly catalog: CatalogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateQuotationInput): Promise<Result<QuotationWithDetails, DomainError>> {
    const quotation = await this.quotations.findById(input.quotationId);
    if (quotation === null) {
      return err(new QuotationNotFoundError(input.quotationId));
    }

    if (!isQuotationEditable(quotation)) {
      return err(new QuotationNotEditableError(quotation.status));
    }

    if (input.validUntil !== undefined && input.validUntil < this.clock.today()) {
      return err(new QuotationValidityDateError());
    }

    if (
      input.currencyId !== undefined &&
      (await this.catalog.findCurrencyById(input.currencyId)) === null
    ) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }

    await this.quotations.update(input.quotationId, {
      ...(input.currencyId !== undefined ? { currencyId: input.currencyId } : {}),
      ...(input.quotedPrice !== undefined ? { quotedPrice: input.quotedPrice } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });

    const updated = await this.quotations.findByIdWithDetails(input.quotationId);
    if (updated === null) {
      return err(new QuotationNotFoundError(input.quotationId));
    }

    return ok(updated);
  }
}
