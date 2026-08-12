import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { PURCHASE_STATUS_TRANSITIONS, type PurchaseStatus } from './purchase.entity';

export class PurchaseNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Compra', identifier);
  }
}

export class PurchaseItemNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Item de compra', identifier);
  }
}

export class PurchaseNumberAlreadyExistsError extends ConflictError {
  constructor(purchaseNumber: string) {
    super(`Ya existe una compra con el numero ${purchaseNumber}`, {
      field: 'purchaseNumber',
      purchaseNumber,
    });
  }
}

export class PurchaseWithoutItemsError extends BusinessRuleError {
  constructor() {
    super('Una compra debe incluir al menos un vehiculo');
  }
}

export class DuplicateVehicleInPurchaseError extends BusinessRuleError {
  constructor(vehicleId: string) {
    super('El mismo vehiculo aparece mas de una vez en la compra', { vehicleId });
  }
}

export class InvalidPurchaseStatusTransitionError extends BusinessRuleError {
  constructor(from: PurchaseStatus, to: PurchaseStatus) {
    const allowed = PURCHASE_STATUS_TRANSITIONS[from];
    super(
      from === to
        ? `La compra ya se encuentra en estado "${from}"`
        : allowed.length === 0
          ? `Una compra en estado "${from}" es final y no admite mas cambios de estado`
          : `No se puede pasar una compra de "${from}" a "${to}". Transiciones validas: ${allowed.join(', ')}`,
      { from, to, allowed },
    );
  }
}

export class PurchaseNotEditableError extends BusinessRuleError {
  constructor(status: PurchaseStatus) {
    super(`Una compra en estado "${status}" ya no se puede modificar`, { status });
  }
}
