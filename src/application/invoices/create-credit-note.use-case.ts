import {
  acceptsCreditNotes,
  type CreditNote,
  netAmount,
} from '../../domain/invoices/invoice.entity';
import {
  CreditNoteExceedsInvoiceError,
  InvoiceDoesNotAcceptCreditNotesError,
  InvoiceNotFoundError,
} from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreateCreditNoteInput extends ActorInput {
  readonly invoiceId: string;
  readonly reason: string;
  readonly amount: number;
}

/**
 * Prepara una nota de credito (e-CF E34) contra una factura emitida.
 *
 * Es la unica via para corregir o anular un comprobante ya aceptado por la
 * DGII: un e-CF emitido es inmutable.
 *
 * La suma de las notas no puede superar el importe de la venta. Sin esa regla
 * se podria acreditar mas de lo facturado, que contablemente significaria
 * devolverle al cliente dinero que nunca pago.
 *
 * Nace en `pending` y sin NCF, igual que la factura: el numero lo asigna la
 * DGII al aceptarla.
 */
export class CreateCreditNoteUseCase implements UseCase<CreateCreditNoteInput, CreditNote> {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: CreateCreditNoteInput): Promise<Result<CreditNote, DomainError>> {
    const invoice = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    if (!acceptsCreditNotes(invoice)) {
      return err(new InvoiceDoesNotAcceptCreditNotesError(invoice.status));
    }

    // Las notas ya emitidas consumen importe; las pendientes tambien se
    // descuentan para no dejar preparadas dos notas que juntas se pasen.
    const comprometido = (await this.invoices.listCreditNotes(input.invoiceId))
      .filter((note) => note.status === 'issued' || note.status === 'pending')
      .reduce((total, note) => total + note.amount, 0);

    const disponible = netAmount(invoice.salePrice, comprometido);

    if (input.amount > disponible + 0.01) {
      return err(new CreditNoteExceedsInvoiceError(input.amount, disponible));
    }

    const creditNote = await this.invoices.addCreditNote({
      invoiceId: input.invoiceId,
      reason: input.reason.trim(),
      amount: input.amount,
      createdBy: input.actorUserId,
    });

    return ok(creditNote);
  }
}
