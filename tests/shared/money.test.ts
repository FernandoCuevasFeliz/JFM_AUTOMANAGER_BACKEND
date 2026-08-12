import { describe, expect, it } from 'vitest';
import {
  isExchangeRateConsistent,
  REPORTING_CURRENCY_CODE,
  toReportingCurrency,
} from '../../src/domain/shared/money';

describe('conversion a moneda de reporte', () => {
  it('consolida en pesos dominicanos', () => {
    expect(REPORTING_CURRENCY_CODE).toBe('DOP');
  });

  it('convierte con la tasa del documento', () => {
    expect(toReportingCurrency(11_000, 60.5)).toBe(665_500);
  });

  it('deja intacto un importe que ya esta en pesos', () => {
    expect(toReportingCurrency(145_000, 1)).toBe(145_000);
  });

  it('redondea a dos decimales', () => {
    expect(toReportingCurrency(10.005, 3.3333)).toBe(33.35);
  });

  it('exige tasa 1 en documentos ya expresados en pesos', () => {
    expect(isExchangeRateConsistent('DOP', 1)).toBe(true);
    expect(isExchangeRateConsistent('DOP', 60.5)).toBe(false);
  });

  it('tolera el relleno de CHAR(3) y las minusculas', () => {
    expect(isExchangeRateConsistent('dop ', 1)).toBe(true);
    expect(isExchangeRateConsistent('dop ', 2)).toBe(false);
  });

  it('acepta cualquier tasa positiva en moneda extranjera', () => {
    expect(isExchangeRateConsistent('USD', 60.5)).toBe(true);
    expect(isExchangeRateConsistent('USD', 1)).toBe(true);
  });
});
