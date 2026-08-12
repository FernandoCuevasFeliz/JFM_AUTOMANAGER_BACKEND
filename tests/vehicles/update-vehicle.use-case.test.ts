import { beforeEach, describe, expect, it } from 'vitest';
import { UpdateVehicleUseCase } from '../../src/application/vehicles/update-vehicle.use-case';
import {
  FakeVehicleCatalogRepository,
  FakeVehicleRepository,
  makeVehicle,
  resetIds,
} from '../helpers/fake-vehicle-repository';

describe('UpdateVehicleUseCase', () => {
  let vehicles: FakeVehicleRepository;
  let catalog: FakeVehicleCatalogRepository;
  let useCase: UpdateVehicleUseCase;

  beforeEach(() => {
    resetIds();
    vehicles = new FakeVehicleRepository();
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1', chassisNumber: 'AAA111' }));
    catalog = new FakeVehicleCatalogRepository();
    useCase = new UpdateVehicleUseCase(vehicles, catalog);
  });

  it('actualiza solo los campos enviados', async () => {
    const result = await useCase.execute({ vehicleId: 'v1', salePrice: 999_000 });

    expect(result.ok).toBe(true);
    const updated = vehicles.vehicles.get('v1');
    expect(updated?.salePrice).toBe(999_000);
    expect(updated?.color).toBe('Blanco');
  });

  it('permite conservar el mismo chasis sin disparar el conflicto de unicidad', async () => {
    const result = await useCase.execute({ vehicleId: 'v1', chassisNumber: 'aaa111' });

    expect(result.ok).toBe(true);
  });

  it('rechaza tomar el chasis de otro vehiculo', async () => {
    vehicles.vehicles.set('v2', makeVehicle({ id: 'v2', chassisNumber: 'BBB222' }));

    const result = await useCase.execute({ vehicleId: 'v1', chassisNumber: 'BBB222' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.httpStatus).toBe(409);
    expect(vehicles.vehicles.get('v1')?.chassisNumber).toBe('AAA111');
  });

  it('rechaza cambiar a un modelo de otra marca', async () => {
    const result = await useCase.execute({ vehicleId: 'v1', modelId: 'model-2' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('acepta cambiar marca y modelo juntos de forma coherente', async () => {
    const result = await useCase.execute({
      vehicleId: 'v1',
      brandId: 'brand-2',
      modelId: 'model-2',
    });

    expect(result.ok).toBe(true);
    expect(vehicles.vehicles.get('v1')?.brandId).toBe('brand-2');
  });

  it('no permite cambiar el estado por esta via', async () => {
    // `UpdateVehicleInput` no expone `status`: el cambio de estado tiene su
    // propio caso de uso sujeto a la maquina de estados.
    const input: Record<string, unknown> = { vehicleId: 'v1', status: 'sold' };
    await useCase.execute(input as never);

    expect(vehicles.vehicles.get('v1')?.status).toBe('in_inventory');
  });
});
