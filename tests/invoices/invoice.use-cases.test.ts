import { beforeEach, describe, expect, it } from 'vitest';
import { CreateCreditNoteUseCase } from '../../src/application/invoices/create-credit-note.use-case';
import { CreateInvoiceUseCase } from '../../src/application/invoices/create-invoice.use-case';
import { IssueCreditNoteUseCase } from '../../src/application/invoices/issue-credit-note.use-case';
import { IssueInvoiceUseCase } from '../../src/application/invoices/issue-invoice.use-case';
import type { Sale } from '../../src/domain/sales/sale.entity';
import type { SaleRepository } from '../../src/domain/sales/sale.repository';
import { FakeInvoiceRepository } from '../helpers/fake-invoice-repository';
import { FixedClock } from '../helpers/fake-auth';

const PRECIO_VENTA = 1_800_000;

function makeSale(overrides: Partial<Sale> = {}): Sale {
  const now = new Date('2026-03-01T10:00:00Z');
  return {
    id: 'sale-1', saleNumber: 'VEN-2026-000001', reservationId: null, quotationId: null,
    clientId: 'cli-1', currencyId: 'cur-dop', exchangeRate: 1, saleDate: '2026-03-01',
    status: 'completed', salespersonId: 'user-1',
    items: [
      {
        id: 'item-1', saleId: 'sale-1', vehicleId: 'veh-1', salePrice: PRECIO_VENTA,
        status: 'active', returnedAt: null, returnReason: null,
        createdAt: now, updatedAt: now,
      },
    ],
    salePrice: PRECIO_VENTA,
    createdAt: now, updatedAt: now, deletedAt: null,
    ...overrides,
  };
}

/** Solo implementa lo que necesitan los casos de uso de facturación. */
function fakeSales(sale: Sale | null): SaleRepository {
  return {
    findById: async (id: string) => (sale !== null && sale.id === id ? sale : null),
    findItemById: async (itemId: string) =>
      sale?.items.find((item) => item.id === itemId) ?? null,
  } as unknown as SaleRepository;
}

describe('CreateInvoiceUseCase', () => {
  let invoices: FakeInvoiceRepository;

  beforeEach(() => {
    invoices = new FakeInvoiceRepository();
  });

  it('crea el comprobante en estado pendiente y SIN NCF', async () => {
    const useCase = new CreateInvoiceUseCase(invoices, fakeSales(makeSale()));

    const result = await useCase.execute({ saleId: 'sale-1', ncfType: 'E31', actorUserId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('pending');
    expect(result.value.ncfNumber).toBeNull();
    expect(result.value.issuedAt).toBeNull();
  });

  it('no factura una venta cancelada', async () => {
    const useCase = new CreateInvoiceUseCase(invoices, fakeSales(makeSale({ status: 'cancelled' })));

    const result = await useCase.execute({ saleId: 'sale-1', ncfType: 'E31', actorUserId: 'user-1' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.httpStatus).toBe(422);
  });

  it('rechaza un segundo comprobante para la misma venta', async () => {
    const useCase = new CreateInvoiceUseCase(invoices, fakeSales(makeSale()));
    await useCase.execute({ saleId: 'sale-1', ncfType: 'E31', actorUserId: 'user-1' });

    const result = await useCase.execute({ saleId: 'sale-1', ncfType: 'E32', actorUserId: 'user-1' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.httpStatus).toBe(409);
  });

  it('devuelve 404 si la venta no existe', async () => {
    const useCase = new CreateInvoiceUseCase(invoices, fakeSales(null));
    const result = await useCase.execute({ saleId: 'inexistente', ncfType: 'E31', actorUserId: 'u' });
    expect(result.ok).toBe(false);
  });
});

describe('IssueInvoiceUseCase', () => {
  let invoices: FakeInvoiceRepository;
  let issue: IssueInvoiceUseCase;
  let invoiceId: string;

  beforeEach(async () => {
    invoices = new FakeInvoiceRepository();
    issue = new IssueInvoiceUseCase(invoices, new FixedClock(new Date('2026-03-05T14:00:00Z')));
    const inv = await invoices.create({ saleId: 'sale-1', ncfType: 'E31', createdBy: 'user-1' });
    invoiceId = inv.id;
    invoices.salePrices.set(invoiceId, PRECIO_VENTA);
  });

  it('registra el NCF, la fecha y el acuse de la DGII', async () => {
    const result = await issue.execute({
      invoiceId, ncfNumber: 'e310000000001', dgiiTrackId: 'TRK-99', xmlUrl: 'https://x/1.xml',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('issued');
    expect(result.value.ncfNumber).toBe('E310000000001');   // normalizado
    expect(result.value.issuedAt).not.toBeNull();
    expect(result.value.dgiiTrackId).toBe('TRK-99');
  });

  it('rechaza un NCF con formato invalido', async () => {
    const result = await issue.execute({
      invoiceId, ncfNumber: 'B0100000001', dgiiTrackId: null, xmlUrl: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('formato');
  });

  it('rechaza un NCF cuyo tipo no coincide con el declarado', async () => {
    const result = await issue.execute({
      invoiceId, ncfNumber: 'E320000000001', dgiiTrackId: null, xmlUrl: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('no corresponde al tipo E31');
  });

  it('rechaza un NCF ya usado en otro comprobante', async () => {
    await issue.execute({ invoiceId, ncfNumber: 'E310000000001', dgiiTrackId: null, xmlUrl: null });
    const otra = await invoices.create({ saleId: 'sale-2', ncfType: 'E31', createdBy: 'user-1' });

    const result = await issue.execute({
      invoiceId: otra.id, ncfNumber: 'E310000000001', dgiiTrackId: null, xmlUrl: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.httpStatus).toBe(409);
  });

  it('no permite emitir dos veces el mismo comprobante', async () => {
    await issue.execute({ invoiceId, ncfNumber: 'E310000000001', dgiiTrackId: null, xmlUrl: null });

    const result = await issue.execute({
      invoiceId, ncfNumber: 'E310000000002', dgiiTrackId: null, xmlUrl: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});

describe('Notas de credito', () => {
  let invoices: FakeInvoiceRepository;
  let crear: CreateCreditNoteUseCase;
  let emitir: IssueCreditNoteUseCase;
  let invoiceId: string;

  beforeEach(async () => {
    invoices = new FakeInvoiceRepository();
    const clock = new FixedClock(new Date('2026-03-10T12:00:00Z'));
    crear = new CreateCreditNoteUseCase(invoices, fakeSales(makeSale()));
    emitir = new IssueCreditNoteUseCase(invoices, clock);

    const inv = await invoices.create({ saleId: 'sale-1', ncfType: 'E31', createdBy: 'user-1' });
    invoiceId = inv.id;
    invoices.salePrices.set(invoiceId, PRECIO_VENTA);
    await invoices.markIssued(invoiceId, {
      ncfNumber: 'E310000000001', issuedAt: new Date('2026-03-05T14:00:00Z'),
      dgiiTrackId: null, xmlUrl: null,
    });
  });

  it('no se pueden emitir contra una factura que la DGII aun no acepto', async () => {
    const pendiente = await invoices.create({ saleId: 'sale-9', ncfType: 'E31', createdBy: 'u' });
    invoices.salePrices.set(pendiente.id, 500_000);

    const result = await crear.execute({
      saleItemId: null, invoiceId: pendiente.id, reason: 'x', amount: 1000, actorUserId: 'u',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('aun no ha sido aceptada');
  });

  it('rechaza una nota que supera el importe de la factura', async () => {
    const result = await crear.execute({
      saleItemId: null, invoiceId, reason: 'Devolucion total', amount: PRECIO_VENTA + 1, actorUserId: 'u',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('supera el importe vigente');
  });

  it('cuenta las notas PENDIENTES al calcular lo disponible', async () => {
    await crear.execute({ saleItemId: null, invoiceId, reason: 'Parcial 1', amount: 1_000_000, actorUserId: 'u' });

    // Quedan 800.000 disponibles aunque la primera aun no se haya emitido.
    const result = await crear.execute({
      saleItemId: null, invoiceId, reason: 'Parcial 2', amount: 900_000, actorUserId: 'u',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ available: 800_000 });
  });

  it('exige que el NCF de la nota sea de tipo E34', async () => {
    const nota = await crear.execute({ saleItemId: null, invoiceId, reason: 'Devolucion', amount: 100_000, actorUserId: 'u' });
    if (!nota.ok) throw new Error('no se pudo crear la nota');

    const result = await emitir.execute({
      invoiceId, creditNoteId: nota.value.id,
      ncfNumber: 'E310000000099', dgiiTrackId: null, xmlUrl: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('E34');
  });

  it('una nota parcial reduce el neto pero NO anula la factura', async () => {
    const nota = await crear.execute({ saleItemId: null, invoiceId, reason: 'Descuento', amount: 300_000, actorUserId: 'u' });
    if (!nota.ok) throw new Error('no se pudo crear la nota');

    const result = await emitir.execute({
      invoiceId, creditNoteId: nota.value.id,
      ncfNumber: 'E340000000001', dgiiTrackId: null, xmlUrl: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('issued');
    expect(result.value.creditedAmount).toBe(300_000);
    expect(result.value.netAmount).toBe(1_500_000);
  });

  it('al cubrir el importe completo, ANULA la factura', async () => {
    const nota = await crear.execute({
      saleItemId: null, invoiceId, reason: 'Devolucion total del vehiculo', amount: PRECIO_VENTA, actorUserId: 'u',
    });
    if (!nota.ok) throw new Error('no se pudo crear la nota');

    const result = await emitir.execute({
      invoiceId, creditNoteId: nota.value.id,
      ncfNumber: 'E340000000002', dgiiTrackId: null, xmlUrl: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('cancelled');
    expect(result.value.netAmount).toBe(0);
  });

  it('varias notas parciales que suman el total tambien anulan la factura', async () => {
    for (const [monto, ncf] of [[900_000, 'E340000000010'], [900_000, 'E340000000011']] as const) {
      const nota = await crear.execute({ saleItemId: null, invoiceId, reason: 'Parcial', amount: monto, actorUserId: 'u' });
      if (!nota.ok) throw new Error('no se pudo crear la nota');
      await emitir.execute({
        invoiceId, creditNoteId: nota.value.id, ncfNumber: ncf, dgiiTrackId: null, xmlUrl: null,
      });
    }

    const factura = await invoices.findByIdWithDetails(invoiceId);
    expect(factura?.status).toBe('cancelled');
    expect(factura?.creditedAmount).toBe(PRECIO_VENTA);
  });
});
