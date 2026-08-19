import { beforeEach, describe, expect, it } from 'vitest';
import { RegisterRefundUseCase } from '../../src/application/sales/register-refund.use-case';
import { RemoveSaleItemUseCase } from '../../src/application/sales/remove-sale-item.use-case';
import { ReturnSaleItemUseCase } from '../../src/application/sales/return-sale-item.use-case';
import { UpdateSaleItemUseCase } from '../../src/application/sales/update-sale-item.use-case';
import type { CatalogRepository, Currency } from '../../src/domain/catalogs/catalog.entity';
import type { InvoiceRepository } from '../../src/domain/invoices/invoice.repository';
import {
  netPaid,
  type Sale,
  type SaleItem,
  saleTotal,
} from '../../src/domain/sales/sale.entity';
import type { SaleRepository } from '../../src/domain/sales/sale.repository';
import type { Result } from '../../src/domain/shared/result';
import type { TransactionalContext, UnitOfWork } from '../../src/domain/shared/unit-of-work';
import { FixedClock } from '../helpers/fake-auth';

/**
 * Venta de varios vehiculos y devolucion de dinero (migracion 008).
 *
 * Lo que se fija aqui son las reglas que antes no podian existir: que el total
 * de la venta se derive de las lineas vigentes, que devolver una unidad no
 * toque el resto de la venta, que la unidad facturada no salga sin nota de
 * credito y que no se pueda reembolsar mas de lo cobrado.
 */

const HOY = new Date('2026-03-10T12:00:00Z');

const DOP: Currency = {
  id: 'cur-dop', code: 'DOP', name: 'Peso dominicano', symbol: 'RD$',
  isActive: true, createdAt: HOY, updatedAt: HOY,
};

function item(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 'item-1', saleId: 'sale-1', vehicleId: 'veh-1', salePrice: 1_000_000,
    status: 'active', returnedAt: null, returnReason: null,
    createdAt: HOY, updatedAt: HOY,
    ...overrides,
  };
}

function makeSale(items: SaleItem[], overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1', saleNumber: 'VEN-2026-000001', reservationId: null, quotationId: null,
    clientId: 'cli-1', currencyId: 'cur-dop', exchangeRate: 1, saleDate: '2026-03-01',
    status: 'in_process', salespersonId: 'user-1',
    items,
    salePrice: saleTotal(items),
    createdAt: HOY, updatedAt: HOY, deletedAt: null,
    ...overrides,
  };
}

interface Escrituras {
  devueltas: Array<{ id: string; reason: string }>;
  quitadas: string[];
  precios: Array<{ id: string; salePrice: number }>;
  vehiculos: Array<{ id: string; status: string }>;
  reembolsos: Array<{ amount: number; saleItemId: string | null }>;
}

function montar(opciones: {
  sale: Sale;
  paid?: number;
  refunded?: number;
  invoiceStatus?: 'pending' | 'issued' | null;
  creditedPorLinea?: Record<string, number>;
}) {
  const escrituras: Escrituras = {
    devueltas: [], quitadas: [], precios: [], vehiculos: [], reembolsos: [],
  };

  const salesFake = {
    findById: async () => opciones.sale,
    findByIdWithDetails: async () => ({ ...opciones.sale, totalPaid: opciones.paid ?? 0 }),
    findItemById: async (id: string) =>
      opciones.sale.items.find((i) => i.id === id) ?? null,
    totalPaid: async () => opciones.paid ?? 0,
    totalRefunded: async () => opciones.refunded ?? 0,
    updateItemPrice: async (id: string, salePrice: number) => {
      escrituras.precios.push({ id, salePrice });
      return item({ id, salePrice });
    },
    returnItem: async (id: string, data: { reason: string }) => {
      escrituras.devueltas.push({ id, reason: data.reason });
      return item({ id, status: 'returned' });
    },
    removeItem: async (id: string) => {
      escrituras.quitadas.push(id);
      return true;
    },
    addRefund: async (data: { amount: number; saleItemId: string | null }) => {
      escrituras.reembolsos.push({ amount: data.amount, saleItemId: data.saleItemId });
      return { id: 'ref-1', ...data };
    },
  };

  const ctx = {
    sales: salesFake,
    vehicles: {
      findById: async (id: string) => ({ id, status: 'sold' }),
      updateStatus: async (id: string, status: string) => {
        escrituras.vehiculos.push({ id, status });
      },
    },
  } as unknown as TransactionalContext;

  const unitOfWork: UnitOfWork = {
    run: async <T, E>(work: (c: TransactionalContext) => Promise<Result<T, E>>) => work(ctx),
  };

  const invoices = {
    findBySaleId: async () =>
      opciones.invoiceStatus == null
        ? null
        : { id: 'inv-1', saleId: 'sale-1', status: opciones.invoiceStatus },
    creditedAmountForSaleItem: async (id: string) => opciones.creditedPorLinea?.[id] ?? 0,
  } as unknown as InvoiceRepository;

  const catalog = {
    findCurrencyById: async (id: string) => (id === DOP.id ? DOP : null),
    findPaymentMethodById: async () => ({ id: 'pm-1', name: 'Efectivo', isActive: true }),
  } as unknown as CatalogRepository;

  return {
    escrituras,
    sales: salesFake as unknown as SaleRepository,
    devolver: new ReturnSaleItemUseCase(unitOfWork, salesFake as unknown as SaleRepository, invoices, new FixedClock(HOY)),
    quitar: new RemoveSaleItemUseCase(unitOfWork, salesFake as unknown as SaleRepository),
    cambiarPrecio: new UpdateSaleItemUseCase(salesFake as unknown as SaleRepository),
    reembolsar: new RegisterRefundUseCase(unitOfWork, catalog),
  };
}

describe('Total de la venta derivado de las lineas', () => {
  it('suma solo las lineas vigentes', () => {
    const items = [
      item({ id: 'a', salePrice: 1_000_000 }),
      item({ id: 'b', salePrice: 900_000 }),
      item({ id: 'c', salePrice: 700_000, status: 'returned' }),
    ];

    expect(saleTotal(items)).toBe(1_900_000);
  });

  it('una venta con todas las lineas devueltas vale cero, no negativo', () => {
    expect(saleTotal([item({ status: 'returned' })])).toBe(0);
  });

  it('el cobrado neto descuenta los reembolsos', () => {
    expect(netPaid(1_500_000, 400_000)).toBe(1_100_000);
  });
});

describe('ReturnSaleItemUseCase', () => {
  const dosLineas = () => [
    item({ id: 'item-1', vehicleId: 'veh-1', salePrice: 1_000_000 }),
    item({ id: 'item-2', vehicleId: 'veh-2', salePrice: 900_000 }),
  ];

  it('devuelve una unidad y deja la venta viva con el resto', async () => {
    const m = montar({ sale: makeSale(dosLineas()) });

    const result = await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-1',
      reason: 'El cliente desistio de esta unidad', destination: 'in_inventory',
    });

    expect(result.ok).toBe(true);
    expect(m.escrituras.devueltas).toEqual([
      { id: 'item-1', reason: 'El cliente desistio de esta unidad' },
    ]);
    expect(m.escrituras.vehiculos).toEqual([{ id: 'veh-1', status: 'in_inventory' }]);
    // La otra linea no se toca.
    expect(m.escrituras.devueltas).toHaveLength(1);
  });

  it('puede mandar el vehiculo devuelto al taller', async () => {
    const m = montar({ sale: makeSale(dosLineas()) });

    await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-2', reason: 'Volvio con danos', destination: 'in_repair',
    });

    expect(m.escrituras.vehiculos).toEqual([{ id: 'veh-2', status: 'in_repair' }]);
  });

  it('no devuelve dos veces la misma linea', async () => {
    const m = montar({ sale: makeSale([item({ status: 'returned', returnedAt: HOY, returnReason: 'x' })]) });

    const result = await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-1', reason: 'Otra vez', destination: 'in_inventory',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.httpStatus).toBe(409);
  });

  it('una venta cancelada ya devolvio todo: no admite devoluciones por linea', async () => {
    const m = montar({ sale: makeSale(dosLineas(), { status: 'cancelled' }) });

    const result = await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-1', reason: 'Motivo', destination: 'in_inventory',
    });

    expect(result.ok).toBe(false);
  });

  it('BLOQUEO FISCAL: con factura emitida y sin nota de credito, no sale el vehiculo', async () => {
    const m = montar({ sale: makeSale(dosLineas()), invoiceStatus: 'issued' });

    const result = await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-1', reason: 'Devolucion', destination: 'in_inventory',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('nota de credito');
    expect(m.escrituras.devueltas).toEqual([]);
  });

  it('con la nota de credito emitida por el importe de la linea, si sale', async () => {
    const m = montar({
      sale: makeSale(dosLineas()),
      invoiceStatus: 'issued',
      creditedPorLinea: { 'item-1': 1_000_000 },
    });

    const result = await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-1', reason: 'Devolucion', destination: 'in_inventory',
    });

    expect(result.ok).toBe(true);
    expect(m.escrituras.devueltas).toHaveLength(1);
  });

  it('una factura pendiente todavia no existe para la DGII y no bloquea', async () => {
    const m = montar({ sale: makeSale(dosLineas()), invoiceStatus: 'pending' });

    const result = await m.devolver.execute({
      saleId: 'sale-1', saleItemId: 'item-1', reason: 'Devolucion', destination: 'in_inventory',
    });

    expect(result.ok).toBe(true);
  });
});

describe('RemoveSaleItemUseCase', () => {
  it('quita una linea agregada por error y libera el vehiculo', async () => {
    const m = montar({
      sale: makeSale([
        item({ id: 'item-1', vehicleId: 'veh-1' }),
        item({ id: 'item-2', vehicleId: 'veh-2', salePrice: 900_000 }),
      ]),
    });

    const result = await m.quitar.execute({ saleId: 'sale-1', saleItemId: 'item-2' });

    expect(result.ok).toBe(true);
    expect(m.escrituras.quitadas).toEqual(['item-2']);
    expect(m.escrituras.vehiculos).toEqual([{ id: 'veh-2', status: 'in_inventory' }]);
  });

  it('no deja la venta sin vehiculos: para eso esta cancelar', async () => {
    const m = montar({ sale: makeSale([item()]) });

    const result = await m.quitar.execute({ saleId: 'sale-1', saleItemId: 'item-1' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('cancele la venta');
  });

  it('no deja el total por debajo de lo ya cobrado', async () => {
    const m = montar({
      sale: makeSale([
        item({ id: 'item-1', salePrice: 1_000_000 }),
        item({ id: 'item-2', vehicleId: 'veh-2', salePrice: 900_000 }),
      ]),
      paid: 1_500_000,
    });

    const result = await m.quitar.execute({ saleId: 'sale-1', saleItemId: 'item-2' });

    expect(result.ok).toBe(false);
    expect(m.escrituras.quitadas).toEqual([]);
  });
});

describe('UpdateSaleItemUseCase', () => {
  it('corrige el precio de una unidad', async () => {
    const m = montar({ sale: makeSale([item(), item({ id: 'item-2', vehicleId: 'veh-2', salePrice: 900_000 })]) });

    const result = await m.cambiarPrecio.execute({
      saleId: 'sale-1', saleItemId: 'item-2', salePrice: 950_000,
    });

    expect(result.ok).toBe(true);
    expect(m.escrituras.precios).toEqual([{ id: 'item-2', salePrice: 950_000 }]);
  });

  it('el control es sobre el TOTAL resultante, no sobre la linea', async () => {
    // Cobrado 1.800.000; bajar la segunda linea a 100.000 dejaria el total en
    // 1.100.000, por debajo de lo ya cobrado.
    const m = montar({
      sale: makeSale([
        item({ id: 'item-1', salePrice: 1_000_000 }),
        item({ id: 'item-2', vehicleId: 'veh-2', salePrice: 900_000 }),
      ]),
      paid: 1_800_000,
    });

    const result = await m.cambiarPrecio.execute({
      saleId: 'sale-1', saleItemId: 'item-2', salePrice: 100_000,
    });

    expect(result.ok).toBe(false);
    expect(m.escrituras.precios).toEqual([]);
  });
});

describe('RegisterRefundUseCase', () => {
  let base: ReturnType<typeof montar>;

  beforeEach(() => {
    base = montar({ sale: makeSale([item()]), paid: 600_000 });
  });

  const REEMBOLSO = {
    saleId: 'sale-1',
    refundMethodId: 'pm-1',
    currencyId: 'cur-dop',
    exchangeRate: 1,
    refundDate: '2026-03-10',
    reason: 'Devolucion del deposito',
    actorUserId: 'user-1',
  };

  it('registra el reembolso y devuelve el cobrado neto', async () => {
    const result = await base.reembolsar.execute({
      ...REEMBOLSO, saleItemId: 'item-1', amount: 200_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(base.escrituras.reembolsos).toEqual([{ amount: 200_000, saleItemId: 'item-1' }]);
    expect(result.value.totalPaid).toBe(600_000);
  });

  it('acepta un reembolso general, sin linea', async () => {
    const result = await base.reembolsar.execute({
      ...REEMBOLSO, saleItemId: null, amount: 50_000,
    });

    expect(result.ok).toBe(true);
    expect(base.escrituras.reembolsos).toEqual([{ amount: 50_000, saleItemId: null }]);
  });

  it('no devuelve mas de lo cobrado', async () => {
    const result = await base.reembolsar.execute({
      ...REEMBOLSO, saleItemId: null, amount: 700_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('supera lo cobrado');
    expect(base.escrituras.reembolsos).toEqual([]);
  });

  it('descuenta los reembolsos anteriores del disponible', async () => {
    const m = montar({ sale: makeSale([item()]), paid: 600_000, refunded: 500_000 });

    const result = await m.reembolsar.execute({
      ...REEMBOLSO, saleItemId: null, amount: 200_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ available: 100_000 });
  });

  it('rechaza un reembolso en una moneda distinta a la de la venta', async () => {
    const result = await base.reembolsar.execute({
      ...REEMBOLSO, saleItemId: null, currencyId: 'cur-usd', amount: 1_000,
    });

    expect(result.ok).toBe(false);
  });
});
