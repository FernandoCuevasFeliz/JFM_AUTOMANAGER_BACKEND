import { beforeEach, describe, expect, it } from 'vitest';
import { CreateSaleUseCase } from '../../src/application/sales/create-sale.use-case';
import type { CatalogRepository, Currency } from '../../src/domain/catalogs/catalog.entity';
import type { Client } from '../../src/domain/clients/client.entity';
import type { ClientRepository } from '../../src/domain/clients/client.repository';
import type { Quotation } from '../../src/domain/quotations/quotation.entity';
import type { Reservation } from '../../src/domain/reservations/reservation.entity';
import type { SaleRepository } from '../../src/domain/sales/sale.repository';
import type { Result } from '../../src/domain/shared/result';
import type { TransactionalContext, UnitOfWork } from '../../src/domain/shared/unit-of-work';
import type { Vehicle } from '../../src/domain/vehicles/vehicle.entity';
import { FixedClock } from '../helpers/fake-auth';

/**
 * El cierre del ciclo comercial no tenia ninguna prueba, siendo el caso de uso
 * con mas efectos colaterales del sistema: crea la venta, mueve el vehiculo a
 * `sold`, cierra la reserva y la cotizacion de origen y registra el primer
 * cobro, todo en una transaccion.
 *
 * Lo que se cubre aqui es en concreto lo que el frontend nunca llego a
 * ejercitar —enviaba `reservationId: null` siempre—, mas la comparacion entre
 * el precio y el deposito, que ignoraba la moneda.
 */

const HOY = new Date('2026-03-10T12:00:00Z');

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'veh-1', brandId: 'b-1', modelId: 'm-1', year: 2024,
    chassisNumber: 'VIN-0001', color: null, mileage: null, engineNumber: null,
    transmissionType: null, fuelType: null, salePrice: 2_000_000,
    status: 'reserved', notes: null, isActive: true,
    createdAt: HOY, updatedAt: HOY, deletedAt: null,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'res-1', reservationNumber: 'RES-2026-000001', quotationId: null,
    clientId: 'cli-1', vehicleId: 'veh-1', depositAmount: 150_000,
    reservationDate: '2026-03-01', expirationDate: '2026-04-01', status: 'active',
    createdBy: 'user-1', createdAt: HOY, updatedAt: HOY, deletedAt: null,
    ...overrides,
  };
}

function makeQuotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'cot-1', quotationNumber: 'COT-2026-000001', clientId: 'cli-1', vehicleId: 'veh-1',
    currencyId: 'cur-dop', quotedPrice: 2_000_000, validUntil: '2026-04-01',
    status: 'approved', createdBy: 'user-1', notes: null,
    createdAt: HOY, updatedAt: HOY, deletedAt: null,
    ...overrides,
  };
}

const CLIENTE: Client = {
  id: 'cli-1', clientType: 'individual', documentTypeId: 'dt-1', documentNumber: '001-0000000-1',
  firstName: 'Ana', lastName: 'Martinez', companyName: null, email: null, phone: '809-000-0000',
  address: null, city: null, isActive: true, createdAt: HOY, updatedAt: HOY, deletedAt: null,
};

const DOP: Currency = {
  id: 'cur-dop', code: 'DOP', name: 'Peso dominicano', symbol: 'RD$',
  isActive: true, createdAt: HOY, updatedAt: HOY,
};

const USD: Currency = {
  id: 'cur-usd', code: 'USD', name: 'Dolar', symbol: 'US$',
  isActive: true, createdAt: HOY, updatedAt: HOY,
};

/** Registro de lo que la transaccion escribio, para poder afirmar sobre ello. */
interface Escrituras {
  vehicleStatus: string | null;
  reservationStatus: Array<{ id: string; status: string }>;
  quotationStatus: Array<{ id: string; status: string }>;
  pagos: Array<{ amount: number; currencyId: string }>;
  lineas: Array<{ vehicleId: string; salePrice: number }>;
  ventaCreada: Record<string, unknown> | null;
}

function montar(opciones: {
  vehicle?: Vehicle;
  reservation?: Reservation | null;
  quotation?: Quotation | null;
  currencies?: Currency[];
}) {
  const escrituras: Escrituras = {
    vehicleStatus: null,
    reservationStatus: [],
    quotationStatus: [],
    pagos: [],
    lineas: [],
    ventaCreada: null,
  };

  const vehicle = opciones.vehicle ?? makeVehicle();
  const reservation = opciones.reservation ?? null;
  const quotation = opciones.quotation ?? null;
  const currencies = opciones.currencies ?? [DOP, USD];

  const ctx = {
    vehicles: {
      findById: async (id: string) => (id === vehicle.id ? vehicle : null),
      updateStatus: async (_id: string, status: string) => {
        escrituras.vehicleStatus = status;
      },
    },
    sales: {
      isVehicleSold: async () => false,
      lastNumberForYear: async () => null,
      create: async (nueva: Record<string, unknown>) => {
        escrituras.ventaCreada = nueva;
        return { id: 'sale-nueva', ...nueva };
      },
      addItem: async (saleId: string, linea: { vehicleId: string; salePrice: number }) => {
        escrituras.lineas.push(linea);
        return { id: `item-${escrituras.lineas.length}`, saleId, ...linea, status: 'active' };
      },
      addPayment: async (pago: { amount: number; currencyId: string }) => {
        escrituras.pagos.push({ amount: pago.amount, currencyId: pago.currencyId });
      },
    },
    reservations: {
      findById: async (id: string) => (reservation !== null && reservation.id === id ? reservation : null),
      updateStatus: async (id: string, status: string) => {
        escrituras.reservationStatus.push({ id, status });
      },
    },
    quotations: {
      findById: async (id: string) => (quotation !== null && quotation.id === id ? quotation : null),
      updateStatus: async (id: string, status: string) => {
        escrituras.quotationStatus.push({ id, status });
      },
    },
  } as unknown as TransactionalContext;

  const unitOfWork: UnitOfWork = {
    run: async <T, E>(work: (c: TransactionalContext) => Promise<Result<T, E>>) => work(ctx),
  };

  const sales = {
    findByIdWithDetails: async (id: string) => ({ id, saleNumber: 'VEN-2026-000001' }),
  } as unknown as SaleRepository;

  const clients = {
    findById: async (id: string) => (id === CLIENTE.id ? CLIENTE : null),
  } as unknown as ClientRepository;

  const catalog = {
    findCurrencyById: async (id: string) => currencies.find((c) => c.id === id) ?? null,
    findPaymentMethodById: async () => ({ id: 'pm-1', name: 'Efectivo', isActive: true }),
  } as unknown as CatalogRepository;

  const useCase = new CreateSaleUseCase(
    unitOfWork,
    sales,
    clients,
    catalog,
    new FixedClock(HOY),
  );

  return { useCase, escrituras };
}

const VENTA_BASE = {
  clientId: 'cli-1',
  items: [{ vehicleId: 'veh-1', salePrice: 2_000_000 }],
  currencyId: 'cur-dop',
  exchangeRate: 1,
  saleDate: '2026-03-10',
  salespersonId: 'user-1',
  actorUserId: 'user-1',
  initialPayment: null,
};

describe('CreateSaleUseCase · conversion del documento de origen', () => {
  let montaje: ReturnType<typeof montar>;

  beforeEach(() => {
    montaje = montar({ reservation: makeReservation(), quotation: makeQuotation() });
  });

  it('marca la reserva como convertida y guarda el enlace en la venta', async () => {
    const result = await montaje.useCase.execute({
      ...VENTA_BASE,
      reservationId: 'res-1',
      quotationId: null,
    });

    expect(result.ok).toBe(true);
    expect(montaje.escrituras.reservationStatus).toEqual([{ id: 'res-1', status: 'converted' }]);
    expect(montaje.escrituras.ventaCreada?.reservationId).toBe('res-1');
    expect(montaje.escrituras.vehicleStatus).toBe('sold');
  });

  it('marca tambien la cotizacion cuando la venta llega con las dos', async () => {
    const result = await montaje.useCase.execute({
      ...VENTA_BASE,
      reservationId: 'res-1',
      quotationId: 'cot-1',
    });

    expect(result.ok).toBe(true);
    expect(montaje.escrituras.quotationStatus).toEqual([{ id: 'cot-1', status: 'converted' }]);
    expect(montaje.escrituras.ventaCreada?.quotationId).toBe('cot-1');
  });

  it('NO convierte nada si la venta llega sin origen: es el fallo que tenia el frontend', async () => {
    const result = await montaje.useCase.execute({
      ...VENTA_BASE,
      reservationId: null,
      quotationId: null,
    });

    expect(result.ok).toBe(true);
    expect(montaje.escrituras.reservationStatus).toEqual([]);
    expect(montaje.escrituras.quotationStatus).toEqual([]);
  });

  it('rechaza una reserva de otro cliente', async () => {
    const otro = montar({ reservation: makeReservation({ clientId: 'cli-9' }) });

    const result = await otro.useCase.execute({
      ...VENTA_BASE,
      reservationId: 'res-1',
      quotationId: null,
    });

    expect(result.ok).toBe(false);
  });

  it('registra el deposito como primer cobro en la moneda de la venta', async () => {
    const result = await montaje.useCase.execute({
      ...VENTA_BASE,
      reservationId: 'res-1',
      quotationId: null,
      initialPayment: {
        paymentMethodId: 'pm-1',
        amount: 150_000,
        paymentDate: '2026-03-10',
        referenceNumber: 'Deposito RES-2026-000001',
      },
    });

    expect(result.ok).toBe(true);
    expect(montaje.escrituras.pagos).toEqual([{ amount: 150_000, currencyId: 'cur-dop' }]);
  });
});

describe('CreateSaleUseCase · precio contra deposito', () => {
  it('rechaza un precio por debajo del deposito, en la misma moneda', async () => {
    const { useCase } = montar({ reservation: makeReservation({ depositAmount: 150_000 }) });

    const result = await useCase.execute({
      ...VENTA_BASE,
      items: [{ vehicleId: 'veh-1', salePrice: 100_000 }],
      reservationId: 'res-1',
      quotationId: null,
    });

    expect(result.ok).toBe(false);
  });

  /*
   * El caso que se rechazaba mal: 30.000 dolares a 60 pesos son 1.800.000
   * pesos, muy por encima del deposito de 150.000. Antes se comparaba 30.000
   * contra 150.000 en crudo y la venta no se podia registrar.
   */
  it('acepta una venta en divisa cuyo equivalente en pesos supera el deposito', async () => {
    const { useCase } = montar({ reservation: makeReservation({ depositAmount: 150_000 }) });

    const result = await useCase.execute({
      ...VENTA_BASE,
      currencyId: 'cur-usd',
      items: [{ vehicleId: 'veh-1', salePrice: 30_000 }],
      exchangeRate: 60,
      reservationId: 'res-1',
      quotationId: null,
    });

    expect(result.ok).toBe(true);
  });

  /*
   * Y el simetrico, que antes pasaba sin control: 1.000 dolares son 60.000
   * pesos, por debajo del deposito de 150.000. En crudo, 1.000 < 150.000 tambien
   * fallaba, pero por la razon equivocada; con una divisa de mas valor unitario
   * el control se saltaba del todo.
   */
  it('rechaza una venta en divisa cuyo equivalente en pesos no cubre el deposito', async () => {
    const { useCase } = montar({ reservation: makeReservation({ depositAmount: 150_000 }) });

    const result = await useCase.execute({
      ...VENTA_BASE,
      currencyId: 'cur-usd',
      items: [{ vehicleId: 'veh-1', salePrice: 1_000 }],
      exchangeRate: 60,
      reservationId: 'res-1',
      quotationId: null,
    });

    expect(result.ok).toBe(false);
  });
});
