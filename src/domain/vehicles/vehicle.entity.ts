/**
 * Estados posibles de un vehiculo (`vehicle_status_enum` en la base).
 */
export type VehicleStatus =
  | 'in_transit'
  | 'in_inventory'
  | 'reserved'
  | 'sold'
  | 'in_repair'
  | 'unavailable';

export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
  'in_transit',
  'in_inventory',
  'reserved',
  'sold',
  'in_repair',
  'unavailable',
];

export interface Vehicle {
  readonly id: string;
  readonly brandId: string;
  readonly modelId: string;
  readonly year: number;
  /** VIN. Unico en toda la base. */
  readonly chassisNumber: string;
  readonly color: string | null;
  readonly mileage: number | null;
  readonly engineNumber: string | null;
  readonly transmissionType: string | null;
  readonly fuelType: string | null;
  /** Precio de lista sugerido; el precio real se fija en la venta. */
  readonly salePrice: number | null;
  readonly status: VehicleStatus;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/** Vehiculo con marca y modelo resueltos, para listados y detalle. */
export interface VehicleWithDetails extends Vehicle {
  readonly brandName: string;
  readonly modelName: string;
  readonly images: VehicleImage[];
}

export interface VehicleImage {
  readonly id: string;
  readonly vehicleId: string;
  readonly url: string;
  readonly isPrimary: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewVehicle {
  readonly brandId: string;
  readonly modelId: string;
  readonly year: number;
  readonly chassisNumber: string;
  readonly color: string | null;
  readonly mileage: number | null;
  readonly engineNumber: string | null;
  readonly transmissionType: string | null;
  readonly fuelType: string | null;
  readonly salePrice: number | null;
  readonly status: VehicleStatus;
  readonly notes: string | null;
  readonly isActive: boolean;
}

export interface VehicleUpdate {
  readonly brandId?: string;
  readonly modelId?: string;
  readonly year?: number;
  readonly chassisNumber?: string;
  readonly color?: string | null;
  readonly mileage?: number | null;
  readonly engineNumber?: string | null;
  readonly transmissionType?: string | null;
  readonly fuelType?: string | null;
  readonly salePrice?: number | null;
  readonly notes?: string | null;
  readonly isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Maquina de estados
// ---------------------------------------------------------------------------

/**
 * Transiciones validas del ciclo de vida de un vehiculo:
 *
 *                      +------------------ unavailable <-----------+
 *                      |                    ^   |                  |
 *                      v                    |   v                  |
 *   in_transit --> in_inventory <---------> in_repair              |
 *                      |    ^                                      |
 *                      |    | (reserva cancelada / vencida)        |
 *                      v    |                                      |
 *                  reserved -+--------------------------------------
 *                      |
 *                      v
 *                    sold  --(solo por cancelacion de venta)--> in_inventory
 *
 * Reglas que codifica el mapa:
 * - `in_transit` es el estado inicial por defecto: el vehiculo fue comprado
 *   pero todavia no llego. Solo puede entrar a inventario, a taller o quedar
 *   no disponible.
 * - `sold` es practicamente terminal: la unica salida es volver a inventario,
 *   y esa transicion la produce exclusivamente la cancelacion de una venta
 *   (nunca un cambio manual de estado; ver `isCommerciallyManagedStatus`).
 * - Entrar a `reserved` o `sold` es potestad del ciclo comercial
 *   (reservas y ventas), no del mantenimiento de inventario.
 */
export const VEHICLE_STATUS_TRANSITIONS: Readonly<Record<VehicleStatus, readonly VehicleStatus[]>> =
  {
    in_transit: ['in_inventory', 'in_repair', 'unavailable'],
    in_inventory: ['reserved', 'sold', 'in_repair', 'unavailable'],
    reserved: ['sold', 'in_inventory', 'unavailable'],
    in_repair: ['in_inventory', 'unavailable'],
    unavailable: ['in_transit', 'in_inventory', 'in_repair'],
    sold: ['in_inventory'],
  };

export function canTransitionTo(from: VehicleStatus, to: VehicleStatus): boolean {
  if (from === to) {
    return false;
  }
  return VEHICLE_STATUS_TRANSITIONS[from].includes(to);
}

export function allowedTransitionsFrom(status: VehicleStatus): readonly VehicleStatus[] {
  return VEHICLE_STATUS_TRANSITIONS[status];
}

/**
 * Estados que solo puede fijar el ciclo comercial (crear/cancelar reserva,
 * crear/cancelar venta). El endpoint de cambio manual de estado los rechaza:
 * si un vehiculo pudiera marcarse `sold` a mano, quedaria vendido sin venta
 * asociada y el inventario dejaria de cuadrar con las ventas.
 */
export function isCommerciallyManagedStatus(status: VehicleStatus): boolean {
  return status === 'reserved' || status === 'sold';
}

/** Estados desde los que un vehiculo puede venderse. */
export const SELLABLE_STATUSES: readonly VehicleStatus[] = ['in_inventory', 'reserved'];

export function isSellable(vehicle: Vehicle): boolean {
  return (
    vehicle.deletedAt === null && vehicle.isActive && SELLABLE_STATUSES.includes(vehicle.status)
  );
}

/** Un vehiculo solo se reserva estando disponible en inventario. */
export function isReservable(vehicle: Vehicle): boolean {
  return vehicle.deletedAt === null && vehicle.isActive && vehicle.status === 'in_inventory';
}

/**
 * Se puede cotizar cualquier vehiculo que no este vendido: cotizar un vehiculo
 * en transito o en taller es una practica normal del negocio.
 */
export function isQuotable(vehicle: Vehicle): boolean {
  return vehicle.deletedAt === null && vehicle.isActive && vehicle.status !== 'sold';
}
