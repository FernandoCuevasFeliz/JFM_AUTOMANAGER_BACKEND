import {
  canTransitionFiscalDocTo,
  type InvoiceWithDetails,
  isValidNcfNumber,
  ncfMatchesType,
} from '../../domain/invoices/invoice.entity';
import {
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

export interface IssueInvoiceInput {
  readonly invoiceId: string;
  /** NCF que devolvio la DGII al aceptar el comprobante. */
  readonly ncfNumber: string;
  readonly dgiiTrackId: string | null;
  readonly xmlUrl: string | null;
}

/**
 * Registra que la DGII acepto el comprobante.
 *
 * Este caso de uso NO habla con la DGII: la firma y el envio los resuelve un
 * PSFE homologado. Aqui solo se persiste el resultado, que es lo que el sistema
 * necesita para imprimir el documento y para los reportes fiscales.
 *
 * A partir de `issued` el comprobante queda inmutable: corregirlo exige una
 * nota de credito.
 */
export class IssueInvoiceUseCase implements UseCase<IssueInvoiceInput, InvoiceWithDetails> {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: IssueInvoiceInput): Promise<Result<InvoiceWithDetails, DomainError>> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (invoice === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    if (!canTransitionFiscalDocTo(invoice.status, 'issued')) {
      return err(new InvalidFiscalStatusTransitionError(invoice.status, 'issued'));
    }

    const ncfNumber = input.ncfNumber.trim().toUpperCase();

    if (!isValidNcfNumber(ncfNumber)) {
      return err(new InvalidNcfNumberError(ncfNumber));
    }

    // El NCF codifica el tipo en sus dos primeros digitos: si no coincide con
    // el declarado, el comprobante saldria con un tratamiento fiscal que no es
    // el suyo.
    if (!ncfMatchesType(ncfNumber, invoice.ncfType)) {
      return err(new NcfTypeMismatchError(ncfNumber, invoice.ncfType));
    }

    if (await this.invoices.existsByNcfNumber(ncfNumber)) {
      return err(new NcfNumberAlreadyUsedError(ncfNumber));
    }

    await this.invoices.markIssued(input.invoiceId, {
      ncfNumber,
      issuedAt: this.clock.now(),
      dgiiTrackId: input.dgiiTrackId,
      xmlUrl: input.xmlUrl,
    });

    const updated = await this.invoices.findByIdWithDetails(input.invoiceId);
    if (updated === null) {
      return err(new InvoiceNotFoundError(input.invoiceId));
    }

    return ok(updated);
  }
}
