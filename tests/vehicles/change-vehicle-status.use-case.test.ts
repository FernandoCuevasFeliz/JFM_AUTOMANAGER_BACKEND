import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeVehicleStatusUseCase } from '../../src/application/vehicles/change-vehicle-status.use-case';
import { FakeVehicleRepository, makeVehicle, resetIds } from '../helpers/fake-vehicle-repository';

describe('ChangeVehicleStatusUseCase', () => {
  let vehicles: FakeVehicleRepository;
  let useCase: ChangeVehicleStatusUseCase;

  beforeEach(() => {
    resetIds();
    vehicles = new FakeVehicleRepository();
    useCase = new ChangeVehicleStatusUseCase(vehicles);
  });

  it('mueve un vehiculo en transito a inventario', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'in_transit' }));

    const result = await useCase.execute({ vehicleId: 'v1', status: 'in_inventory' });

    expect(result.ok).toBe(true);
    expect(vehicles.vehicles.get('v1')?.status).toBe('in_inventory');
  });

  it('rechaza una transicion que la maquina de estados no contempla', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'in_repair' }));

    const result = await useCase.execute({ vehicleId: 'v1', status: 'in_transit' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(result.error.details).toMatchObject({ from: 'in_repair', to: 'in_transit' });
    expect(vehicles.vehicles.get('v1')?.status).toBe('in_repair');
  });

  it('rechaza quedarse en el mismo estado', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'in_inventory' }));

    const result = await useCase.execute({ vehicleId: 'v1', status: 'in_inventory' });

    expect(result.ok).toBe(false);
  });

  it('no deja marcar un vehiculo como vendido a mano: eso lo hace la venta', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'in_inventory' }));

    // El tipo de entrada admite el enum completo (`VehicleStatus`); es el caso
    // de uso quien rechaza los estados del ciclo comercial. El esquema Zod de
    // la ruta ademas ni siquiera los acepta en el request.
    const result = await useCase.execute({ vehicleId: 'v1', status: 'sold' });

    expect(result.ok).toBe(false);
    expect(vehicles.vehicles.get('v1')?.status).toBe('in_inventory');
  });

  it('no deja sacar a mano de "sold" un vehiculo vendido', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'sold' }));

    const result = await useCase.execute({ vehicleId: 'v1', status: 'in_inventory' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('ciclo comercial');
    expect(vehicles.vehicles.get('v1')?.status).toBe('sold');
  });

  it('devuelve 404 si el vehiculo no existe', async () => {
    const result = await useCase.execute({ vehicleId: 'inexistente', status: 'in_inventory' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.httpStatus).toBe(404);
  });

  it('ignora vehiculos borrados logicamente', async () => {
    vehicles.vehicles.set(
      'v1',
      makeVehicle({ id: 'v1', status: 'in_inventory', deletedAt: new Date() }),
    );

    const result = await useCase.execute({ vehicleId: 'v1', status: 'in_repair' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.httpStatus).toBe(404);
  });
});
