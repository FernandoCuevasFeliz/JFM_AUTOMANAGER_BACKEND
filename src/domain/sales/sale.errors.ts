import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { SALE_STATUS_TRANSITIONS, type SaleStatus } from './sale.entity';

export class SaleNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Venta', identifier);
  }
}

export class SaleItemNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Linea de venta', identifier);
  }
}

export class RefundNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Reembolso', identifier);
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

/**
 * El precio pactado no cubre el deposito que el cliente ya entrego.
 *
 * Los dos importes llegan **en la moneda de reporte**: el deposito se guarda
 * asi (`reservations.deposit_amount` no tiene columna de moneda) y el precio se
 * convierte con la tasa de la venta antes de compararlos. Sin esa conversion,
 * una venta de 30.000 dolares contra un deposito de 150.000 pesos se rechazaba
 * estando perfectamente bien.
 */
export class SalePriceBelowDepositError extends BusinessRuleError {
  constructor(salePriceConverted: number, depositAmount: number) {
    super(
      `El precio de venta (${salePriceConverted.toFixed(2)} en moneda de reporte) no puede ser menor que el deposito ya recibido en la reserva (${depositAmount.toFixed(2)})`,
      { salePriceConverted, depositAmount },
    );
  }
}

/**
 * El pago llega en una moneda distinta a la de la venta.
 *
 * `sale_payments` guarda `currency_id` pero no una tasa propia, asi que sumar
 * un abono en dolares con uno en pesos daria un saldo sin sentido. La regla es
 * que el abono se registra en la moneda de la venta: si el cliente paga en otra
 * divisa, la conversion la hace la caja al recibir, no el sistema al sumar.
 */
export class PaymentCurrencyMismatchError extends BusinessRuleError {
  constructor(saleCurrencyCode: string) {
    super(
      `El pago debe registrarse en la moneda de la venta (${saleCurrencyCode})`,
      { expectedCurrency: saleCurrencyCode },
    );
  }
}

// ---------------------------------------------------------------------------
// Lineas de venta (varios vehiculos por documento)
// ---------------------------------------------------------------------------

/** Una venta sin vehiculos no es una venta. */
export class EmptySaleError extends BusinessRuleError {
  constructor() {
    super('La venta debe incluir al menos un vehiculo', { field: 'items' });
  }
}

/**
 * El mismo vehiculo dos veces en el mismo documento. La base tambien lo
 * rechazaria (indice unico parcial `uq_sale_items_vehicle_active`), pero como
 * un 500 sin explicacion: mejor detectarlo al validar la peticion.
 */
export class DuplicateVehicleInSaleError extends BusinessRuleError {
  constructor(vehicleId: string) {
    super('Un mismo vehiculo no puede aparecer dos veces en la misma venta', {
      field: 'items',
      vehicleId,
    });
  }
}

export class SaleItemDoesNotBelongToSaleError extends BusinessRuleError {
  constructor(saleItemId: string, saleId: string) {
    super('La linea indicada no pertenece a esta venta', { saleItemId, saleId });
  }
}

export class SaleItemAlreadyReturnedError extends ConflictError {
  constructor(saleItemId: string) {
    super('El vehiculo de esta linea ya fue devuelto', { saleItemId });
  }
}

export class SaleDoesNotAcceptReturnsError extends BusinessRuleError {
  constructor(status: SaleStatus) {
    super(
      'Una venta cancelada ya devolvio todos sus vehiculos: no admite devoluciones por linea',
      { status },
    );
  }
}

/**
 * La ultima linea vigente no se puede QUITAR, solo devolver.
 *
 * Quitarla dejaria una venta sin vehiculos, que no significa nada: si la
 * operacion entera se cae, lo que corresponde es cancelar la venta.
 */
export class LastSaleItemError extends BusinessRuleError {
  constructor(saleId: string) {
    super(
      'No se puede quitar el ultimo vehiculo de la venta: cancele la venta completa',
      { saleId },
    );
  }
}

/**
 * Bloqueo fiscal de la devolucion.
 *
 * Con una factura EMITIDA, el importe de la unidad ya existe ante la DGII. Sacar
 * la linea del total sin acreditarla dejaria la venta y el comprobante diciendo
 * cosas distintas del mismo dinero. Primero la nota de credito por el importe de
 * la linea, despues la devolucion.
 */
export class SaleItemNotCreditedError extends BusinessRuleError {
  constructor(saleItemId: string, itemAmount: number, creditedAmount: number) {
    super(
      `El vehiculo esta facturado: emita primero una nota de credito por su importe (${itemAmount.toFixed(2)}; acreditado hasta ahora ${creditedAmount.toFixed(2)})`,
      { saleItemId, itemAmount, creditedAmount },
    );
  }
}

// ---------------------------------------------------------------------------
// Reembolsos
// ---------------------------------------------------------------------------

/**
 * No se puede devolver mas de lo que se cobro.
 *
 * El limite es lo cobrado menos lo ya reembolsado, no el precio de la venta:
 * devolver dinero que el cliente nunca entrego no es un reembolso, es una
 * salida de caja sin origen.
 */
export class RefundExceedsPaidError extends BusinessRuleError {
  constructor(amount: number, available: number) {
    super(
      `El reembolso de ${amount.toFixed(2)} supera lo cobrado disponible para devolver (${available.toFixed(2)})`,
      { amount, available },
    );
  }
}

/** Misma razon que en los cobros: sumar monedas distintas da un saldo falso. */
export class RefundCurrencyMismatchError extends BusinessRuleError {
  constructor(saleCurrencyCode: string) {
    super(
      `El reembolso debe registrarse en la moneda de la venta (${saleCurrencyCode})`,
      { expectedCurrency: saleCurrencyCode },
    );
  }
}
