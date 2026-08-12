import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteVehicleUseCase } from '../../src/application/vehicles/delete-vehicle.use-case';
import { FakeVehicleRepository, makeVehicle, resetIds } from '../helpers/fake-vehicle-repository';

describe('DeleteVehicleUseCase', () => {
  let vehicles: FakeVehicleRepository;
  let useCase: DeleteVehicleUseCase;

  beforeEach(() => {
    resetIds();
    vehicles = new FakeVehicleRepository();
    useCase = new DeleteVehicleUseCase(vehicles);
  });

  it('borra logicamente un vehiculo disponible y lo desactiva', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'in_inventory' }));

    const result = await useCase.execute({ vehicleId: 'v1' });

    expect(result.ok).toBe(true);
    expect(vehicles.vehicles.get('v1')?.deletedAt).not.toBeNull();
    expect(vehicles.vehicles.get('v1')?.isActive).toBe(false);
  });

  it('no borra un vehiculo vendido', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'sold' }));

    const result = await useCase.execute({ vehicleId: 'v1' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('venta registrada');
    expect(vehicles.vehicles.get('v1')?.deletedAt).toBeNull();
  });

  it('no borra un vehiculo reservado y explica que hay que cancelar la reserva', async () => {
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', status: 'reserved' }));

    const result = await useCase.execute({ vehicleId: 'v1' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('Cancele la reserva');
  });

  it('devuelve 404 si no existe', async () => {
    const result = await useCase.execute({ vehicleId: 'inexistente' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.httpStatus).toBe(404);
  });
});
