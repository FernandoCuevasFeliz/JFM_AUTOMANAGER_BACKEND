import { canTransitionFiscalDocTo, type InvoiceWithDetails } from '../../domain/invoices/invoice.entity';
import {
  InvalidFiscalStatusTransitionError,
  InvoiceNotEditableError,
  InvoiceNotFoundError,
} from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface CancelInvoiceInput {
  readonly invoiceId: string;
}

/**
 * Anula un comprobante que TODAVIA NO fue aceptado por la DGII.
 *
 * Sirve para descartar un borrador o un envio rechazado que ya no se va a
 * corregir. Una factura `issued` no se anula por esta via: fiscalmente ya
 * existe, y la unica forma de revertirla es emitir notas de credito que cubran
 * su importe (lo hace `create-credit-note` / `issue-credit-note`).
 */
export class CancelInvoiceUseCase implements UseCase<CancelInvoiceInput, InvoiceWithDetails> {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: CancelInvoiceInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    if (invoice.status === 'issued') {
      return err(new InvoiceNotEditableError(invoice.status));
    }

    if (!canTransitionFiscalDocTo(invoice.status, 'cancelled')) {
      return err(new InvalidFiscalStatusTransitionError(invoice.status, 'cancelled'));
    }

    await this.invoices.updateStatus(input.invoiceId, 'cancelled');

    const updated = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (updated === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    return ok(updated);
  }
}
