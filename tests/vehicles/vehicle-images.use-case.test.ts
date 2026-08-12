import { beforeEach, describe, expect, it } from 'vitest';
import { AddVehicleImageUseCase } from '../../src/application/vehicles/add-vehicle-image.use-case';
import { DeleteVehicleImageUseCase } from '../../src/application/vehicles/delete-vehicle-image.use-case';
import { SetPrimaryVehicleImageUseCase } from '../../src/application/vehicles/set-primary-vehicle-image.use-case';
import { FakeVehicleRepository, makeVehicle, resetIds } from '../helpers/fake-vehicle-repository';

describe('imagenes del vehiculo', () => {
  let vehicles: FakeVehicleRepository;
  let addImage: AddVehicleImageUseCase;
  let deleteImage: DeleteVehicleImageUseCase;
  let setPrimary: SetPrimaryVehicleImageUseCase;

  beforeEach(() => {
    resetIds();
    vehicles = new FakeVehicleRepository();
    vehicles.vehicles.set('v1', makeVehicle({ id: 'v1' }));
    addImage = new AddVehicleImageUseCase(vehicles);
    deleteImage = new DeleteVehicleImageUseCase(vehicles);
    setPrimary = new SetPrimaryVehicleImageUseCase(vehicles);
  });

  it('marca como principal la primera imagen aunque no se pida', async () => {
    const result = await addImage.execute({
      vehicleId: 'v1',
      url: 'https://cdn.ejgh.do/v1/frente.jpg',
      isPrimary: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.isPrimary).toBe(true);
  });

  it('deja como secundarias las imagenes siguientes', async () => {
    await addImage.execute({ vehicleId: 'v1', url: 'https://cdn/1.jpg', isPrimary: false });
    const second = await addImage.execute({
      vehicleId: 'v1',
      url: 'https://cdn/2.jpg',
      isPrimary: false,
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.value.isPrimary).toBe(false);
  });

  it('al fijar una principal desmarca la anterior', async () => {
    const first = await addImage.execute({ vehicleId: 'v1', url: 'https://cdn/1.jpg', isPrimary: true });
    const second = await addImage.execute({ vehicleId: 'v1', url: 'https://cdn/2.jpg', isPrimary: false });

    if (!first.ok || !second.ok) {
      throw new Error('no se pudieron crear las imagenes de prueba');
    }

    await setPrimary.execute({ vehicleId: 'v1', imageId: second.value.id });

    const images = await vehicles.listImages('v1');
    expect(images.filter((image) => image.isPrimary)).toHaveLength(1);
    expect(images[0]?.id).toBe(second.value.id);
  });

  it('al borrar la principal promueve otra para que el vehiculo no quede sin portada', async () => {
    const first = await addImage.execute({ vehicleId: 'v1', url: 'https://cdn/1.jpg', isPrimary: true });
    await addImage.execute({ vehicleId: 'v1', url: 'https://cdn/2.jpg', isPrimary: false });

    if (!first.ok) {
      throw new Error('no se pudo crear la imagen de prueba');
    }

    const result = await deleteImage.execute({ vehicleId: 'v1', imageId: first.value.id });

    expect(result.ok).toBe(true);
    const images = await vehicles.listImages('v1');
    expect(images).toHaveLength(1);
    expect(images[0]?.isPrimary).toBe(true);
  });

  it('rechaza operar sobre una imagen que pertenece a otro vehiculo', async () => {
    vehicles.vehicles.set('v2', makeVehicle({ id: 'v2', chassisNumber: 'OTRO123' }));
    const image = await addImage.execute({ vehicleId: 'v2', url: 'https://cdn/x.jpg', isPrimary: true });

    if (!image.ok) {
      throw new Error('no se pudo crear la imagen de prueba');
    }

    const result = await deleteImage.execute({ vehicleId: 'v1', imageId: image.value.id });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.httpStatus).toBe(404);
  });

  it('devuelve 404 al agregar una imagen a un vehiculo inexistente', async () => {
    const result = await addImage.execute({
      vehicleId: 'inexistente',
      url: 'https://cdn/1.jpg',
      isPrimary: true,
    });

    expect(result.ok).toBe(false);
  });
});
