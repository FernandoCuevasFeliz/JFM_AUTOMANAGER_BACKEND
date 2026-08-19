import { describe, expect, it } from 'vitest';
import {
  acceptsCreditNotes,
  canTransitionFiscalDocTo,
  creditedAmount,
  type CreditNote,
  FISCAL_DOC_STATUSES,
  type FiscalDocStatus,
  type Invoice,
  isFiscalDocEditable,
  isFullyCredited,
  isValidNcfNumber,
  ncfMatchesType,
  netAmount,
} from '../../src/domain/invoices/invoice.entity';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const now = new Date('2026-03-01T10:00:00Z');
  return {
    id: 'inv-1',
    saleId: 'sale-1',
    ncfType: 'E31',
    ncfNumber: null,
    status: 'pending',
    issuedAt: null,
    dgiiTrackId: null,
    xmlUrl: null,
    rejectionReason: null,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeNote(amount: number, status: FiscalDocStatus): CreditNote {
  const now = new Date('2026-03-02T10:00:00Z');
  return {
    id: `cn-${amount}-${status}`,
    invoiceId: 'inv-1',
    saleItemId: null,
    ncfNumber: status === 'issued' ? 'E340000000001' : null,
    reason: 'Devolucion parcial',
    amount,
    status,
    issuedAt: status === 'issued' ? now : null,
    dgiiTrackId: null,
    xmlUrl: null,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
  };
}

describe('maquina de estados fiscal', () => {
  it('sigue el flujo normal: pendiente -> emitido', () => {
    expect(canTransitionFiscalDocTo('pending', 'issued')).toBe(true);
  });

  it('permite reintentar tras un rechazo de la DGII', () => {
    expect(canTransitionFiscalDocTo('pending', 'rejected')).toBe(true);
    expect(canTransitionFiscalDocTo('rejected', 'pending')).toBe(true);
  });

  it('no deja volver atras un comprobante ya emitido', () => {
    expect(canTransitionFiscalDocTo('issued', 'pending')).toBe(false);
    expect(canTransitionFiscalDocTo('issued', 'rejected')).toBe(false);
  });

  it('solo permite anular un comprobante emitido', () => {
    expect(canTransitionFiscalDocTo('issued', 'cancelled')).toBe(true);
  });

  it('trata "cancelled" como terminal', () => {
    for (const status of FISCAL_DOC_STATUSES) {
      expect(canTransitionFiscalDocTo('cancelled', status)).toBe(false);
    }
  });

  it('no considera transicion quedarse en el mismo estado', () => {
    for (const status of FISCAL_DOC_STATUSES) {
      expect(canTransitionFiscalDocTo(status, status)).toBe(false);
    }
  });

  it('solo son editables los comprobantes que la DGII aun no acepto', () => {
    expect(isFiscalDocEditable('pending')).toBe(true);
    expect(isFiscalDocEditable('rejected')).toBe(true);
    expect(isFiscalDocEditable('issued')).toBe(false);
    expect(isFiscalDocEditable('cancelled')).toBe(false);
  });
});

describe('notas de credito', () => {
  it('solo se aceptan contra una factura emitida', () => {
    expect(acceptsCreditNotes(makeInvoice({ status: 'issued' }))).toBe(true);
    expect(acceptsCreditNotes(makeInvoice({ status: 'pending' }))).toBe(false);
    expect(acceptsCreditNotes(makeInvoice({ status: 'rejected' }))).toBe(false);
    expect(acceptsCreditNotes(makeInvoice({ status: 'cancelled' }))).toBe(false);
  });

  it('solo suma las notas EMITIDAS: una pendiente no acredita nada todavia', () => {
    const notas = [makeNote(100_000, 'issued'), makeNote(50_000, 'pending')];
    expect(creditedAmount(notas)).toBe(100_000);
  });

  it('ignora las notas rechazadas y anuladas', () => {
    const notas = [makeNote(70_000, 'rejected'), makeNote(30_000, 'cancelled')];
    expect(creditedAmount(notas)).toBe(0);
  });

  it('descuenta lo acreditado del importe de la venta', () => {
    expect(netAmount(1_800_000, 300_000)).toBe(1_500_000);
  });

  it('nunca deja la factura en negativo', () => {
    expect(netAmount(1_000_000, 1_500_000)).toBe(0);
  });

  it('considera anulada la factura cuando las notas cubren el importe', () => {
    expect(isFullyCredited(1_800_000, 1_800_000)).toBe(true);
    expect(isFullyCredited(1_800_000, 1_799_999.995)).toBe(true);
    expect(isFullyCredited(1_800_000, 1_700_000)).toBe(false);
  });
});

describe('formato del NCF electronico', () => {
  it('acepta E + tipo (2 digitos) + secuencia (10 digitos)', () => {
    expect(isValidNcfNumber('E310000000001')).toBe(true);
    expect(isValidNcfNumber('E340000012345')).toBe(true);
  });

  it('normaliza espacios y minusculas', () => {
    expect(isValidNcfNumber('  e310000000001  ')).toBe(true);
  });

  it('rechaza formatos que no son e-CF', () => {
    expect(isValidNcfNumber('B0100000001')).toBe(false);
    expect(isValidNcfNumber('E31')).toBe(false);
    expect(isValidNcfNumber('E31000000000A')).toBe(false);
    expect(isValidNcfNumber('')).toBe(false);
  });

  it('verifica que el NCF corresponda al tipo declarado', () => {
    expect(ncfMatchesType('E310000000001', 'E31')).toBe(true);
    expect(ncfMatchesType('E320000000001', 'E31')).toBe(false);
    expect(ncfMatchesType('E340000000001', 'E34')).toBe(true);
  });
});
