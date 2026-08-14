import {
  canTransitionFiscalDocTo,
  creditedAmount,
  type InvoiceWithDetails,
  isFullyCredited,
  isValidNcfNumber,
  ncfMatchesType,
} from '../../domain/invoices/invoice.entity';
import {
  CreditNoteNotFoundError,
  InvalidFiscalStatusTransitionError,
  InvalidNcfNumberError,
  InvoiceNotFoundError,
  NcfNumberAlreadyUsedError,
  NcfTypeMismatchError,
} from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface IssueCreditNoteInput {
  readonly invoiceId: string;
  readonly creditNoteId: string;
  readonly ncfNumber: string;
  readonly dgiiTrackId: string | null;
  readonly xmlUrl: string | null;
}

/**
 * Registra que la DGII acepto una nota de credito.
 *
 * Efecto secundario clave: si las notas emitidas pasan a cubrir el importe
 * completo de la venta, la factura queda ANULADA (`cancelled`). Esa es la unica
 * forma en que un comprobante emitido cambia de estado, y es lo que permite
 * despues cancelar la venta correspondiente.
 *
 * Una nota de credito siempre es de tipo E34, asi que su NCF debe empezar por
 * ese codigo independientemente del tipo de la factura que corrige.
 */
export class IssueCreditNoteUseCase implements UseCase<IssueCreditNoteInput, InvoiceWithDetails> {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: IssueCreditNoteInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    const creditNote = await this.invoices.findCreditNoteById(input.creditNoteId);
    if (creditNote === null || creditNote.invoiceId !== input.invoiceId) {
      return err(new CreditNoteNotFoundError(input.creditNoteId));
    }

    if (!canTransitionFiscalDocTo(creditNote.status, 'issued')) {
      return err(new InvalidFiscalStatusTransitionError(creditNote.status, 'issued'));
    }

    const ncfNumber = input.ncfNumber.trim().toUpperCase();

    if (!isValidNcfNumber(ncfNumber)) {
      return err(new InvalidNcfNumberError(ncfNumber));
    }

    if (!ncfMatchesType(ncfNumber, 'E34')) {
      return err(new NcfTypeMismatchError(ncfNumber, 'E34'));
    }

    if (await this.invoices.existsByNcfNumber(ncfNumber)) {
      return err(new NcfNumberAlreadyUsedError(ncfNumber));
    }

    await this.invoices.markCreditNoteIssued(input.creditNoteId, {
      ncfNumber,
      issuedAt: this.clock.now(),
      dgiiTrackId: input.dgiiTrackId,
      xmlUrl: input.xmlUrl,
    });

    const acreditado = creditedAmount(await this.invoices.listCreditNotes(input.invoiceId));
    if (isFullyCredited(invoice.salePrice, acreditado)) {
      await this.invoices.updateStatus(input.invoiceId, 'cancelled');
    }

    const actualizada = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (actualizada === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    return ok(actualizada);
  }
}

export interface RejectCreditNoteInput {
  readonly invoiceId: string;
  readonly creditNoteId: string;
}

/** Registra que la DGII rechazo la nota de credito. */
export class RejectCreditNoteUseCase
  implements UseCase<RejectCreditNoteInput, InvoiceWithDetails>
{
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: RejectCreditNoteInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const creditNote = await this.invoices.findCreditNoteById(input.creditNoteId);
    if (creditNote === null || creditNote.invoiceId !== input.invoiceId) {
      return err(new CreditNoteNotFoundError(input.creditNoteId));
    }

    if (!canTransitionFiscalDocTo(creditNote.status, 'rejected')) {
      return err(new InvalidFiscalStatusTransitionError(creditNote.status, 'rejected'));
    }

    await this.invoices.markCreditNoteRejected(input.creditNoteId);

    const actualizada = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (actualizada === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    return ok(actualizada);
  }
}
