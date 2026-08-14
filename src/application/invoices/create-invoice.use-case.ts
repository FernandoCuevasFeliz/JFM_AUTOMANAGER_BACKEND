import type { Invoice, NcfType } from '../../domain/invoices/invoice.entity';
import {
  SaleAlreadyInvoicedError,
  SaleNotInvoiceableError,
} from '../../domain/invoices/invoice.errors';
import type { InvoiceRepository } from '../../domain/invoices/invoice.repository';
import { SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreateInvoiceInput extends ActorInput {
  readonly saleId: string;
  readonly ncfType: NcfType;
}

/**
 * Prepara el comprobante fiscal de una venta.
 *
 * Nace en estado `pending`, SIN numero: el NCF lo asigna la DGII (o el PSFE)
 * al aceptar el envio, y hasta entonces el documento no existe fiscalmente.
 *
 * Dos invariantes:
 *  1. Una venta cancelada no se factura.
 *  2. Una venta tiene un solo comprobante (UNIQUE de `invoices.sale_id`). Se
 *     comprueba aqui para devolver un 409 con el motivo en lugar de dejar
 *     escapar el error de constraint como un 500.
 */
export class CreateInvoiceUseCase implements UseCase<CreateInvoiceInput, Invoice> {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly sales: SaleRepository,
  ) {}

  async execute(input: CreateInvoiceInput): Promise<Result<Invoice, DomainError>> {
    const sale = await this.sales.findById(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    if (sale.status === 'cancelled') {
      return err(new SaleNotInvoiceableError(input.saleId, sale.status));
    }

    if ((await this.invoices.findBySaleId(input.saleId)) !== null) {
      return err(new SaleAlreadyInvoicedError(input.saleId));
    }

    const invoice = await this.invoices.create({
      saleId: input.saleId,
      ncfType: input.ncfType,
      createdBy: input.actorUserId,
    });

    return ok(invoice);
  }
}
