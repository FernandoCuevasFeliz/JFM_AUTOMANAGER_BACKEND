import { canTransitionFiscalDocTo, type InvoiceWithDetails } from '../../domain/invoices/invoice.entity';
import {
  InvalidFiscalStatusTransitionError,
  InvoiceNotFoundError,
} from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface RejectInvoiceInput {
  readonly invoiceId: string;
  /** Motivo que devolvio la DGII. Se guarda para poder corregir y reenviar. */
  readonly reason: string;
}

/**
 * Registra que la DGII rechazo el comprobante.
 *
 * El documento queda en `rejected` con el motivo, y desde ahi puede volver a
 * `pending` (ver `retry-invoice`) una vez corregido lo que la DGII senalo.
 */
export class RejectInvoiceUseCase implements UseCase<RejectInvoiceInput, InvoiceWithDetails> {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: RejectInvoiceInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    if (!canTransitionFiscalDocTo(invoice.status, 'rejected')) {
      return err(new InvalidFiscalStatusTransitionError(invoice.status, 'rejected'));
    }

    await this.invoices.markRejected(input.invoiceId, input.reason.trim());

    const updated = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (updated === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    return ok(updated);
  }
}

export interface RetryInvoiceInput {
  readonly invoiceId: string;
}

/**
 * Devuelve a `pending` un comprobante rechazado, para reintentar el envio tras
 * corregir lo que la DGII observo.
 */
export class RetryInvoiceUseCase implements UseCase<RetryInvoiceInput, InvoiceWithDetails> {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: RetryInvoiceInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    if (!canTransitionFiscalDocTo(invoice.status, 'pending')) {
      return err(new InvalidFiscalStatusTransitionError(invoice.status, 'pending'));
    }

    await this.invoices.updateStatus(input.invoiceId, 'pending');

    const updated = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (updated === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    return ok(updated);
  }
}
