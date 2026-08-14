import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { FISCAL_DOC_TRANSITIONS, type FiscalDocStatus, type NcfType } from './invoice.entity';

export class InvoiceNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Comprobante fiscal', identifier);
  }
}

export class CreditNoteNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Nota de credito', identifier);
  }
}

/** Refleja el UNIQUE de `invoices.sale_id`: una venta, un comprobante. */
export class SaleAlreadyInvoicedError extends ConflictError {
  constructor(saleId: string) {
    super('La venta ya tiene un comprobante fiscal emitido o en proceso', {
      field: 'saleId',
      saleId,
    });
  }
}

export class NcfNumberAlreadyUsedError extends ConflictError {
  constructor(ncfNumber: string) {
    super(`El NCF ${ncfNumber} ya esta registrado en otro comprobante`, {
      field: 'ncfNumber',
      ncfNumber,
    });
  }
}

export class InvalidFiscalStatusTransitionError extends BusinessRuleError {
  constructor(from: FiscalDocStatus, to: FiscalDocStatus) {
    const allowed = FISCAL_DOC_TRANSITIONS[from];
    super(
      from === to
        ? `El comprobante ya se encuentra en estado "${from}"`
        : allowed.length === 0
          ? `Un comprobante en estado "${from}" es final y no admite mas cambios`
          : `No se puede pasar un comprobante de "${from}" a "${to}". Transiciones validas: ${allowed.join(', ')}`,
      { from, to, allowed },
    );
  }
}

export class InvalidNcfNumberError extends BusinessRuleError {
  constructor(ncfNumber: string) {
    super(
      `El NCF "${ncfNumber}" no tiene el formato de un e-CF: se espera E + tipo (2 digitos) + secuencia (10 digitos)`,
      { ncfNumber },
    );
  }
}

export class NcfTypeMismatchError extends BusinessRuleError {
  constructor(ncfNumber: string, ncfType: NcfType) {
    super(
      `El NCF ${ncfNumber} no corresponde al tipo ${ncfType} declarado en el comprobante`,
      { ncfNumber, ncfType },
    );
  }
}

/** Una venta cancelada no genera comprobante fiscal. */
export class SaleNotInvoiceableError extends BusinessRuleError {
  constructor(saleId: string, saleStatus: string) {
    super(
      `No se puede facturar una venta en estado "${saleStatus}"`,
      { saleId, saleStatus },
    );
  }
}

export class InvoiceNotEditableError extends BusinessRuleError {
  constructor(status: FiscalDocStatus) {
    super(
      `Un comprobante en estado "${status}" es inmutable: para corregirlo hay que emitir una nota de credito`,
      { status },
    );
  }
}

/** Solo una factura vigente admite notas de credito. */
export class InvoiceDoesNotAcceptCreditNotesError extends BusinessRuleError {
  constructor(status: FiscalDocStatus) {
    super(
      status === 'pending' || status === 'rejected'
        ? 'La factura aun no ha sido aceptada por la DGII: no hay comprobante que corregir'
        : 'La factura ya esta anulada y no admite mas notas de credito',
      { status },
    );
  }
}

export class CreditNoteExceedsInvoiceError extends BusinessRuleError {
  constructor(amount: number, available: number) {
    super(
      `La nota de credito de ${amount.toFixed(2)} supera el importe vigente de la factura (${available.toFixed(2)})`,
      { amount, available },
    );
  }
}

/**
 * Una venta facturada no se cancela sin dejar rastro fiscal: primero hay que
 * anular su comprobante con una nota de credito.
 */
export class SaleHasActiveInvoiceError extends BusinessRuleError {
  constructor(saleId: string, ncfNumber: string | null) {
    super(
      ncfNumber === null
        ? 'La venta tiene un comprobante fiscal en proceso. Anulelo antes de cancelar la venta'
        : `La venta esta facturada con el NCF ${ncfNumber}. Emita una nota de credito que cubra el importe antes de cancelarla`,
      { saleId, ncfNumber },
    );
  }
}
