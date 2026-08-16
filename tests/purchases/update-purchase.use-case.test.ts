import { describe, expect, it } from 'vitest';
import { UpdatePurchaseUseCase } from '../../src/application/purchases/update-purchase.use-case';
import type { CatalogRepository, Currency } from '../../src/domain/catalogs/catalog.entity';
import type { Purchase } from '../../src/domain/purchases/purchase.entity';
import type { PurchaseRepository } from '../../src/domain/purchases/purchase.repository';
import type { SupplierRepository } from '../../src/domain/suppliers/supplier.repository';

/**
 * La edicion del encabezado de una compra solo comprobaba que la moneda
 * existiera. Con eso, por PATCH se podia dejar una compra en pesos con una tasa
 * distinta de 1 —lo que el alta rechaza— y bastaba enviar uno solo de los dos
 * campos para descuadrar el par.
 *
 * Importa porque los costos de los items se guardan sin moneda propia: la del
 * encabezado es la que les da significado.
 */

const AHORA = new Date('2026-03-10T12:00:00Z');

const DOP: Currency = {
  id: 'cur-dop', code: 'DOP', name: 'Peso dominicano', symbol: 'RD$',
  isActive: true, createdAt: AHORA, updatedAt: AHORA,
};

const USD: Currency = {
  id: 'cur-usd', code: 'USD', name: 'Dolar', symbol: 'US$',
  isActive: true, createdAt: AHORA, updatedAt: AHORA,
};

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'com-1', supplierId: 'prov-1', currencyId: 'cur-usd',
    purchaseNumber: 'COM-2026-000001', invoiceNumber: null, purchaseDate: '2026-03-01',
    exchangeRate: 60, status: 'pending', createdBy: 'user-1', notes: null,
    createdAt: AHORA, updatedAt: AHORA, deletedAt: null,
    ...overrides,
  };
}

function montar(purchase: Purchase) {
  const actualizaciones: Array<Record<string, unknown>> = [];

  const purchases = {
    findById: async (id: string) => (id === purchase.id ? purchase : null),
    update: async (_id: string, cambios: Record<string, unknown>) => {
      actualizaciones.push(cambios);
    },
    findByIdWithDetails: async (id: string) => ({ id, items: [] }),
  } as unknown as PurchaseRepository;

  const suppliers = {
    findById: async () => ({ id: 'prov-1', name: 'Proveedor', isActive: true }),
  } as unknown as SupplierRepository;

  const catalog = {
    findCurrencyById: async (id: string) => [DOP, USD].find((c) => c.id === id) ?? null,
  } as unknown as CatalogRepository;

  return {
    useCase: new UpdatePurchaseUseCase(purchases, suppliers, catalog),
    actualizaciones,
  };
}

describe('UpdatePurchaseUseCase · coherencia entre moneda y tasa', () => {
  it('rechaza pasar la compra a pesos sin corregir la tasa', async () => {
    // Solo llega `currencyId`: la tasa que queda es la vieja, 60, y una compra
    // en pesos con tasa 60 no significa nada.
    const { useCase, actualizaciones } = montar(makePurchase());

    const result = await useCase.execute({ purchaseId: 'com-1', currencyId: 'cur-dop' });

    expect(result.ok).toBe(false);
    expect(actualizaciones).toEqual([]);
  });

  it('rechaza cambiar solo la tasa dejandola incoherente con la moneda actual', async () => {
    const { useCase } = montar(makePurchase({ currencyId: 'cur-dop', exchangeRate: 1 }));

    const result = await useCase.execute({ purchaseId: 'com-1', exchangeRate: 45.5 });

    expect(result.ok).toBe(false);
  });

  it('acepta el cambio a pesos cuando la tasa acompana en la misma peticion', async () => {
    const { useCase, actualizaciones } = montar(makePurchase());

    const result = await useCase.execute({
      purchaseId: 'com-1',
      currencyId: 'cur-dop',
      exchangeRate: 1,
    });

    expect(result.ok).toBe(true);
    expect(actualizaciones).toEqual([{ currencyId: 'cur-dop', exchangeRate: 1 }]);
  });

  it('deja pasar una edicion que no toca ni la moneda ni la tasa', async () => {
    const { useCase, actualizaciones } = montar(makePurchase());

    const result = await useCase.execute({ purchaseId: 'com-1', invoiceNumber: 'INV-77' });

    expect(result.ok).toBe(true);
    expect(actualizaciones).toEqual([{ invoiceNumber: 'INV-77' }]);
  });

  it('no deja editar una compra ya recibida', async () => {
    const { useCase } = montar(makePurchase({ status: 'received' }));

    const result = await useCase.execute({ purchaseId: 'com-1', exchangeRate: 61 });

    expect(result.ok).toBe(false);
  });
});
