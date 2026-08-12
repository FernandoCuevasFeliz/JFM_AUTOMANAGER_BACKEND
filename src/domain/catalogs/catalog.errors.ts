import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';

export class DocumentTypeNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Tipo de documento', identifier);
  }
}

export class CurrencyNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Moneda', identifier);
  }
}

export class PaymentMethodNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Metodo de pago', identifier);
  }
}

export class ExpenseCategoryAlreadyExistsError extends ConflictError {
  constructor(name: string) {
    super(`Ya existe una categoria de gasto con el nombre ${name}`, { field: 'name', name });
  }
}

/**
 * La tasa de cambio no es coherente con la moneda del documento (ver
 * `domain/shared/money.ts`).
 */
export class InconsistentExchangeRateError extends BusinessRuleError {
  constructor(currencyCode: string, exchangeRate: number) {
    super(
      `Un documento en ${currencyCode} debe registrarse con tasa de cambio 1, no ${exchangeRate}`,
      { currencyCode, exchangeRate },
    );
  }
}
