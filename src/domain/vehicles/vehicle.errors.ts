import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';
import { allowedTransitionsFrom, type VehicleStatus } from './vehicle.entity';

export class VehicleNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Vehiculo', identifier);
  }
}

export class ChassisNumberAlreadyExistsError extends ConflictError {
  constructor(chassisNumber: string) {
    super(`Ya existe un vehiculo con el numero de chasis ${chassisNumber}`, {
      field: 'chassisNumber',
      chassisNumber,
    });
  }
}

export class InvalidVehicleStatusTransitionError extends BusinessRuleError {
  constructor(from: VehicleStatus, to: VehicleStatus) {
    super(
      from === to
        ? `El vehiculo ya se encuentra en estado "${from}"`
        : `No se puede pasar un vehiculo de "${from}" a "${to}". Transiciones validas desde "${from}": ${allowedTransitionsFrom(from).join(', ')}`,
      { from, to, allowed: allowedTransitionsFrom(from) },
    );
  }
}

/**
 * El estado destino solo lo puede fijar el ciclo comercial (reserva o venta),
 * no un cambio manual de inventario.
 */
export class VehicleStatusNotManuallyChangeableError extends BusinessRuleError {
  constructor(status: VehicleStatus) {
    super(
      `El estado "${status}" no se asigna manualmente: se deriva del ciclo comercial (reservas y ventas)`,
      { status },
    );
  }
}

export class VehicleNotSellableError extends BusinessRuleError {
  constructor(vehicleId: string, status: VehicleStatus) {
    super(
      `El vehiculo no esta disponible para la venta (estado actual: "${status}"). Solo se venden vehiculos en inventario o reservados`,
      { vehicleId, status },
    );
  }
}

export class VehicleNotReservableError extends BusinessRuleError {
  constructor(vehicleId: string, status: VehicleStatus) {
    super(
      `El vehiculo no esta disponible para reservar (estado actual: "${status}"). Solo se reservan vehiculos en inventario`,
      { vehicleId, status },
    );
  }
}

export class VehicleNotQuotableError extends BusinessRuleError {
  constructor(vehicleId: string, status: VehicleStatus) {
    super(`El vehiculo no se puede cotizar porque ya fue vendido`, { vehicleId, status });
  }
}

/** Refleja el UNIQUE de `sales.vehicle_id`: un vehiculo se vende una sola vez. */
export class VehicleAlreadySoldError extends ConflictError {
  constructor(vehicleId: string) {
    super('El vehiculo ya tiene una venta registrada. Un vehiculo solo se puede vender una vez', {
      field: 'vehicleId',
      vehicleId,
    });
  }
}

/** Refleja el UNIQUE de `purchase_items.vehicle_id`. */
export class VehicleAlreadyPurchasedError extends ConflictError {
  constructor(vehicleId: string) {
    super('El vehiculo ya pertenece a otra compra. Un vehiculo solo se puede comprar una vez', {
      field: 'vehicleId',
      vehicleId,
    });
  }
}

export class VehicleHasActiveOperationsError extends BusinessRuleError {
  constructor(vehicleId: string, reason: string) {
    super(`No se puede eliminar el vehiculo: ${reason}`, { vehicleId });
  }
}

export class VehicleImageNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Imagen de vehiculo', identifier);
  }
}

export class VehicleBrandNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Marca de vehiculo', identifier);
  }
}

export class VehicleModelNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Modelo de vehiculo', identifier);
  }
}

export class VehicleBrandAlreadyExistsError extends ConflictError {
  constructor(name: string) {
    super(`Ya existe una marca con el nombre ${name}`, { field: 'name', name });
  }
}

export class VehicleModelAlreadyExistsError extends ConflictError {
  constructor(name: string) {
    super(`La marca ya tiene un modelo con el nombre ${name}`, { field: 'name', name });
  }
}

export class ModelDoesNotBelongToBrandError extends BusinessRuleError {
  constructor(modelId: string, brandId: string) {
    super('El modelo indicado no pertenece a la marca indicada', { modelId, brandId });
  }
}
