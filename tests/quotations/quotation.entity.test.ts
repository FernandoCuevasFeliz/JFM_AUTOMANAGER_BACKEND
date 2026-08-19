import { describe, expect, it } from 'vitest';
import {
  QUOTATION_STATUS_TRANSITIONS,
  canTransitionQuotationTo,
  isConvertible,
  isExpired,
  isQuotationEditable,
  type Quotation,
  type QuotationStatus,
} from '../../src/domain/quotations/quotation.entity';

const HOY = '2026-03-10';

function makeQuotation(overrides: Partial<Quotation> = {}): Quotation {
  const instante = new Date('2026-03-01T10:00:00Z');
  return {
    id: 'cot-1', quotationNumber: 'COT-2026-000001', clientId: 'cli-1', vehicleId: 'veh-1',
    currencyId: 'cur-dop', quotedPrice: 1_200_000, validUntil: '2026-04-01',
    status: 'approved', createdBy: 'user-1', notes: null,
    createdAt: instante, updatedAt: instante, deletedAt: null,
    ...overrides,
  };
}

describe('isConvertible', () => {
  it('acepta una cotizacion aprobada y vigente', () => {
    expect(isConvertible(makeQuotation(), HOY)).toBe(true);
  });

  it('rechaza una aprobada cuyo plazo ya paso', () => {
    expect(isConvertible(makeQuotation({ validUntil: '2026-03-09' }), HOY)).toBe(false);
  });

  it('acepta la que vence hoy: el ultimo dia todavia cuenta', () => {
    expect(isConvertible(makeQuotation({ validUntil: HOY }), HOY)).toBe(true);
  });

  /*
   * El punto del arreglo: una pendiente no se convierte. Aceptarla contradecia
   * la tabla de transiciones, que no admite `pending -> converted`, y permitia
   * saltarse la aprobacion del cliente por API.
   */
  it('rechaza una pendiente, porque su ciclo exige aprobarla antes', () => {
    expect(isConvertible(makeQuotation({ status: 'pending' }), HOY)).toBe(false);
  });

  it.each<QuotationStatus>(['rejected', 'expired', 'converted'])(
    'rechaza una cotizacion en estado %s',
    (status) => {
      expect(isConvertible(makeQuotation({ status }), HOY)).toBe(false);
    },
  );

  it('rechaza una borrada logicamente', () => {
    expect(isConvertible(makeQuotation({ deletedAt: new Date() }), HOY)).toBe(false);
  });

  /*
   * La invariante que hacia falta: todo lo que `isConvertible` deje pasar tiene
   * que poder transitar a `converted`. `create-reservation` y `create-sale`
   * fijan ese estado directamente, sin preguntar por la transicion, asi que si
   * las dos reglas se separan nadie lo nota hasta que hay datos invalidos.
   */
  it('todo lo convertible puede transitar a convertida', () => {
    const estados = Object.keys(QUOTATION_STATUS_TRANSITIONS) as QuotationStatus[];

    for (const status of estados) {
      const quotation = makeQuotation({ status });
      if (isConvertible(quotation, HOY)) {
        expect(canTransitionQuotationTo(status, 'converted')).toBe(true);
      }
    }
  });
});

describe('isExpired e isQuotationEditable', () => {
  it('vencida es estrictamente anterior a hoy', () => {
    expect(isExpired(makeQuotation({ validUntil: '2026-03-09' }), HOY)).toBe(true);
    expect(isExpired(makeQuotation({ validUntil: HOY }), HOY)).toBe(false);
  });

  it('se edita mientras el ciclo sigue abierto', () => {
    expect(isQuotationEditable(makeQuotation({ status: 'pending' }))).toBe(true);
    expect(isQuotationEditable(makeQuotation({ status: 'approved' }))).toBe(true);
    expect(isQuotationEditable(makeQuotation({ status: 'converted' }))).toBe(false);
    expect(isQuotationEditable(makeQuotation({ status: 'rejected' }))).toBe(false);
  });
});
