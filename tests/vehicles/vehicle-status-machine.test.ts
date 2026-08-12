import { describe, expect, it } from 'vitest';
import {
  allowedTransitionsFrom,
  canTransitionTo,
  isCommerciallyManagedStatus,
  isQuotable,
  isReservable,
  isSellable,
  VEHICLE_STATUSES,
  type VehicleStatus,
} from '../../src/domain/vehicles/vehicle.entity';
import { makeVehicle } from '../helpers/fake-vehicle-repository';

describe('maquina de estados del vehiculo', () => {
  it('acepta el flujo normal de inventario: en transito -> inventario -> reservado -> vendido', () => {
    expect(canTransitionTo('in_transit', 'in_inventory')).toBe(true);
    expect(canTransitionTo('in_inventory', 'reserved')).toBe(true);
    expect(canTransitionTo('reserved', 'sold')).toBe(true);
  });

  it('permite vender directamente desde inventario, sin pasar por reserva', () => {
    expect(canTransitionTo('in_inventory', 'sold')).toBe(true);
  });

  it('libera el vehiculo cuando la reserva se cae', () => {
    expect(canTransitionTo('reserved', 'in_inventory')).toBe(true);
  });

  it('trata "sold" como practicamente terminal: solo vuelve a inventario', () => {
    expect(allowedTransitionsFrom('sold')).toEqual(['in_inventory']);
    expect(canTransitionTo('sold', 'reserved')).toBe(false);
    expect(canTransitionTo('sold', 'in_repair')).toBe(false);
  });

  it('rechaza saltar de en transito a reservado sin haber entrado a inventario', () => {
    expect(canTransitionTo('in_transit', 'reserved')).toBe(false);
    expect(canTransitionTo('in_transit', 'sold')).toBe(false);
  });

  it('no considera transicion quedarse en el mismo estado', () => {
    for (const status of VEHICLE_STATUSES) {
      expect(canTransitionTo(status, status)).toBe(false);
    }
  });

  it('solo marca como gobernados por el ciclo comercial a reservado y vendido', () => {
    const managed = VEHICLE_STATUSES.filter(isCommerciallyManagedStatus);
    expect(managed).toEqual<VehicleStatus[]>(['reserved', 'sold']);
  });
});

describe('disponibilidad comercial del vehiculo', () => {
  it('se puede vender lo que esta en inventario o reservado', () => {
    expect(isSellable(makeVehicle({ status: 'in_inventory' }))).toBe(true);
    expect(isSellable(makeVehicle({ status: 'reserved' }))).toBe(true);
    expect(isSellable(makeVehicle({ status: 'in_transit' }))).toBe(false);
    expect(isSellable(makeVehicle({ status: 'sold' }))).toBe(false);
    expect(isSellable(makeVehicle({ status: 'in_repair' }))).toBe(false);
  });

  it('no se puede vender un vehiculo inactivo o borrado, aunque figure en inventario', () => {
    expect(isSellable(makeVehicle({ status: 'in_inventory', isActive: false }))).toBe(false);
    expect(isSellable(makeVehicle({ status: 'in_inventory', deletedAt: new Date() }))).toBe(false);
  });

  it('solo se reserva lo que esta disponible en inventario', () => {
    expect(isReservable(makeVehicle({ status: 'in_inventory' }))).toBe(true);
    expect(isReservable(makeVehicle({ status: 'reserved' }))).toBe(false);
    expect(isReservable(makeVehicle({ status: 'in_transit' }))).toBe(false);
  });

  it('se cotiza cualquier vehiculo que no este vendido, incluso en transito', () => {
    expect(isQuotable(makeVehicle({ status: 'in_transit' }))).toBe(true);
    expect(isQuotable(makeVehicle({ status: 'in_repair' }))).toBe(true);
    expect(isQuotable(makeVehicle({ status: 'sold' }))).toBe(false);
  });
});
