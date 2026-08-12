import { beforeEach, describe, expect, it } from 'vitest';
import {
  CreateVehicleUseCase,
  type CreateVehicleInput,
} from '../../src/application/vehicles/create-vehicle.use-case';
import {
  FakeVehicleCatalogRepository,
  FakeVehicleRepository,
  makeVehicle,
  resetIds,
} from '../helpers/fake-vehicle-repository';

function inputFor(overrides: Partial<CreateVehicleInput> = {}): CreateVehicleInput {
  return {
    brandId: 'brand-1',
    modelId: 'model-1',
    year: 2024,
    chassisNumber: 'jt2bf22k1x0999999',
    color: 'Negro',
    mileage: 0,
    engineNumber: null,
    transmissionType: 'automatica',
    fuelType: 'gasolina',
    salePrice: 1_400_000,
    status: 'in_transit',
    notes: null,
    isActive: true,
    ...overrides,
  };
}

describe('CreateVehicleUseCase', () => {
  let vehicles: FakeVehicleRepository;
  let catalog: FakeVehicleCatalogRepository;
  let useCase: CreateVehicleUseCase;

  beforeEach(() => {
    resetIds();
    vehicles = new FakeVehicleRepository();
    catalog = new FakeVehicleCatalogRepository();
    useCase = new CreateVehicleUseCase(vehicles, catalog);
  });

  it('crea el vehiculo y normaliza el chasis a mayusculas', async () => {
    const result = await useCase.execute(inputFor());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.chassisNumber).toBe('JT2BF22K1X0999999');
    expect(result.value.status).toBe('in_transit');
    expect(vehicles.vehicles.size).toBe(1);
  });

  it('rechaza un chasis repetido con un error de conflicto y no escribe nada', async () => {
    vehicles.vehicles.set(
      'existente',
      makeVehicle({ id: 'existente', chassisNumber: 'JT2BF22K1X0999999' }),
    );

    const result = await useCase.execute(inputFor());

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.httpStatus).toBe(409);
    expect(vehicles.vehicles.size).toBe(1);
  });

  it('rechaza un modelo que no pertenece a la marca indicada', async () => {
    const result = await useCase.execute(inputFor({ brandId: 'brand-1', modelId: 'model-2' }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(result.error.httpStatus).toBe(422);
    expect(vehicles.vehicles.size).toBe(0);
  });

  it('devuelve 404 cuando la marca no existe', async () => {
    const result = await useCase.execute(inputFor({ brandId: 'brand-inexistente' }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('devuelve 404 cuando el modelo no existe', async () => {
    const result = await useCase.execute(inputFor({ modelId: 'model-inexistente' }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('no permite dar de alta un vehiculo ya reservado o vendido', async () => {
    for (const status of ['reserved', 'sold'] as const) {
      const result = await useCase.execute(inputFor({ status }));

      expect(result.ok).toBe(false);
      if (result.ok) {
        continue;
      }
      expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
    }

    expect(vehicles.vehicles.size).toBe(0);
  });
});
