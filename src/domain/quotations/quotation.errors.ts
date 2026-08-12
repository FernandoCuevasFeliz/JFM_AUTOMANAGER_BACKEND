import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { QUOTATION_STATUS_TRANSITIONS, type QuotationStatus } from './quotation.entity';

export class QuotationNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Cotizacion', identifier);
  }
}

export class QuotationNumberAlreadyExistsError extends ConflictError {
  constructor(quotationNumber: string) {
    super(`Ya existe una cotizacion con el numero ${quotationNumber}`, {
      field: 'quotationNumber',
      quotationNumber,
    });
  }
}

export class InvalidQuotationStatusTransitionError extends BusinessRuleError {
  constructor(from: QuotationStatus, to: QuotationStatus) {
    const allowed = QUOTATION_STATUS_TRANSITIONS[from];
    super(
      from === to
        ? `La cotizacion ya se encuentra en estado "${from}"`
        : allowed.length === 0
          ? `Una cotizacion en estado "${from}" es final y no admite mas cambios`
          : `No se puede pasar una cotizacion de "${from}" a "${to}". Transiciones validas: ${allowed.join(', ')}`,
      { from, to, allowed },
    );
  }
}

export class QuotationExpiredError extends BusinessRuleError {
  constructor(quotationId: string, validUntil: string) {
    super(`La cotizacion vencio el ${validUntil} y ya no puede utilizarse`, {
      quotationId,
      validUntil,
    });
  }
}

export class QuotationNotConvertibleError extends BusinessRuleError {
  constructor(quotationId: string, status: QuotationStatus) {
    super(
      `La cotizacion en estado "${status}" no puede convertirse en reserva o venta`,
      { quotationId, status },
    );
  }
}

export class QuotationValidityDateError extends BusinessRuleError {
  constructor() {
    super('La fecha de validez de la cotizacion no puede ser anterior a hoy');
  }
}

export class QuotationNotEditableError extends BusinessRuleError {
  constructor(status: QuotationStatus) {
    super(`Una cotizacion en estado "${status}" ya no se puede modificar`, { status });
  }
}
