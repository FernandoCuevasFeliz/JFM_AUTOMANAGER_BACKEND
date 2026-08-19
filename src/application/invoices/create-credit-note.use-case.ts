import { acceptsCreditNotes, type CreditNote, netAmount } from '../../domain/invoices/invoice.entity';
import {
  CreditNoteExceedsInvoiceError,
  InvoiceDoesNotAcceptCreditNotesError,
  InvoiceNotFoundError,
} from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import {
  SaleItemDoesNotBelongToSaleError,
  SaleItemNotFoundError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreateCreditNoteInput extends ActorInput {
  readonly invoiceId: string;
  /** Vehiculo que la motiva; `null` = nota sobre el total de la factura. */
  readonly saleItemId: string | null;
  readonly reason: string;
  readonly amount: number;
}

/**
 * Prepara una nota de credito (e-CF E34) contra una factura emitida.
 *
 * Es la unica via para corregir o anular un comprobante ya aceptado por la
 * DGII: un e-CF emitido es inmutable.
 *
 * La nota puede acreditar la venta entera o UN vehiculo de ella. Atada a una
 * linea (`saleItemId`), el techo es el precio de esa unidad y no el de la
 * factura: acreditar 1.800.000 por un vehiculo de 900.000 seria devolverle al
 * cliente el doble de lo que pago por el. Ademas es lo que despues habilita la
 * devolucion del vehiculo en `return-sale-item`.
 *
 * Sin linea, el techo es el importe vigente de la factura. En ambos casos las
 * notas ya emitidas consumen importe, y las pendientes tambien se descuentan
 * para no dejar preparadas dos que juntas se pasen.
 *
 * Nace en `pending` y sin NCF, igual que la factura: el numero lo asigna la
 * DGII al aceptarla.
 */
export class CreateCreditNoteUseCase implements UseCase<CreateCreditNoteInput, CreditNote> {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly sales: SaleRepository,
  ) {}

  async execute(input: CreateCreditNoteInput): Promise<Result<CreditNote, DomainError>> {
    const invoice = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    if (!acceptsCreditNotes(invoice)) {
      return err(new InvoiceDoesNotAcceptCreditNotesError(invoice.status));
    }

    const notes = await this.invoices.listCreditNotes(input.invoiceId);
    const vigentes = notes.filter(
      (note) => note.status === 'issued' || note.status === 'pending',
    );

    let techo = invoice.salePrice;
    let comprometido = vigentes.reduce((total, note) => total + note.amount, 0);

    if (input.saleItemId !== null) {
      const item = await this.sales.findItemById(input.saleItemId);
      if (item === null) {
        return err(new SaleItemNotFoundError(input.saleItemId));
      }
      if (item.saleId !== invoice.saleId) {
        return err(new SaleItemDoesNotBelongToSaleError(input.saleItemId, invoice.saleId));
      }

      techo = item.salePrice;
      comprometido = vigentes
        .filter((note) => note.saleItemId === input.saleItemId)
        .reduce((total, note) => total + note.amount, 0);
    }

    const disponible = netAmount(techo, comprometido);

    if (input.amount > disponible + 0.01) {
      return err(new CreditNoteExceedsInvoiceError(input.amount, disponible));
    }

    const creditNote = await this.invoices.addCreditNote({
      invoiceId: input.invoiceId,
      saleItemId: input.saleItemId,
      reason: input.reason.trim(),
      amount: input.amount,
      createdBy: input.actorUserId,
    });

    return ok(creditNote);
  }
}
