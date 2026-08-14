import type { InvoiceWithDetails } from '../../domain/invoices/invoice.entity';
import { InvoiceNotFoundError } from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetInvoiceInput {
  readonly invoiceId: string;
}

export class GetInvoiceUseCase implements UseCase<GetInvoiceInput, InvoiceWithDetails> {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: GetInvoiceInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }
    return ok(invoice);
  }
}

export interface GetInvoiceBySaleInput {
  readonly saleId: string;
}

/** Comprobante de una venta, para el detalle de la venta en el frontend. */
export class GetInvoiceBySaleUseCase
  implements UseCase<GetInvoiceBySaleInput, InvoiceWithDetails>
{
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: GetInvoiceBySaleInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findBySaleId(input.saleId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(`venta ${input.saleId}`));
    }

    const detalle = await this.invoices.findByIdWithDetails(invoice.id);
    if (detalle === null) {
      return err(new InvoiceNotFoundError(invoice.id));
    }

    return ok(detalle);
  }
}
