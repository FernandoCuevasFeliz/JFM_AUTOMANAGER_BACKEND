import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { SALE_STATUS_TRANSITIONS, type SaleStatus } from './sale.entity';

export class SaleNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Venta', identifier);
  }
}

export class SalePaymentNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Pago de venta', identifier);
  }
}

export class SaleNumberAlreadyExistsError extends ConflictError {
  constructor(saleNumber: string) {
    super(`Ya existe una venta con el numero ${saleNumber}`, { field: 'saleNumber', saleNumber });
  }
}

export class InvalidSaleStatusTransitionError extends BusinessRuleError {
  constructor(from: SaleStatus, to: SaleStatus) {
    const allowed = SALE_STATUS_TRANSITIONS[from];
    super(
      from === to
        ? `La venta ya se encuentra en estado "${from}"`
        : allowed.length === 0
          ? `Una venta en estado "${from}" es final y no admite mas cambios`
          : `No se puede pasar una venta de "${from}" a "${to}". Transiciones validas: ${allowed.join(', ')}`,
      { from, to, allowed },
    );
  }
}

export class SaleNotFullyPaidError extends BusinessRuleError {
  constructor(salePrice: number, paid: number) {
    super(
      `La venta no se puede completar: quedan ${(salePrice - paid).toFixed(2)} pendientes de pago`,
      { salePrice, paid, pending: Number((salePrice - paid).toFixed(2)) },
    );
  }
}

export class PaymentExceedsBalanceError extends BusinessRuleError {
  constructor(amount: number, balance: number) {
    super(
      `El pago de ${amount.toFixed(2)} supera el saldo pendiente de ${balance.toFixed(2)}`,
      { amount, balance },
    );
  }
}

export class SaleDoesNotAcceptPaymentsError extends BusinessRuleError {
  constructor(status: SaleStatus) {
    super(
      status === 'completed'
        ? 'La venta ya esta saldada y no admite mas pagos'
        : 'Una venta cancelada no admite pagos',
      { status },
    );
  }
}

export class SaleNotEditableError extends BusinessRuleError {
  constructor(status: SaleStatus) {
    super(`Una venta en estado "${status}" ya no se puede modificar`, { status });
  }
}

export class SalePriceBelowDepositError extends BusinessRuleError {
  constructor(salePrice: number, depositAmount: number) {
    super(
      `El precio de venta (${salePrice.toFixed(2)}) no puede ser menor que el deposito ya recibido en la reserva (${depositAmount.toFixed(2)})`,
      { salePrice, depositAmount },
    );
  }
}
