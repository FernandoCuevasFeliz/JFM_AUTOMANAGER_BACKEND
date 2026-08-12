/**
 * Conversion a una moneda unica de reporte.
 *
 * DECISION CONTABLE (tercera de las aprobadas): los importes se consolidan en
 * PESOS DOMINICANOS usando la tasa registrada EN CADA DOCUMENTO, no una tasa
 * del dia de la consulta.
 *
 * Es el criterio de costo historico: una unidad comprada a 58.00 y otra a 62.50
 * costaron lo que costaron, y su margen no debe moverse cada vez que fluctua el
 * dolar. Ademas es el unico calculo reproducible: dos consultas al mismo
 * vehiculo en fechas distintas devuelven el mismo numero, y ese numero cuadra
 * con lo que la empresa efectivamente pago.
 *
 * Convencion de `exchange_rate` en todo el sistema: cuantos pesos vale UNA
 * unidad de la moneda del documento. Un documento en pesos lleva tasa 1 (que es
 * el DEFAULT de las tres columnas), y una compra en dolares a 60.50 lleva
 * 60.5000.
 */
export const REPORTING_CURRENCY_CODE = 'DOP';

/** Convierte un importe de la moneda del documento a la moneda de reporte. */
export function toReportingCurrency(amount: number, exchangeRate: number): number {
  return round2(amount * exchangeRate);
}

/**
 * La tasa de un documento ya expresado en la moneda de reporte solo puede ser
 * 1: cualquier otro valor convertiria pesos en pesos y falsearia los totales.
 */
export function isExchangeRateConsistent(currencyCode: string, exchangeRate: number): boolean {
  if (currencyCode.trim().toUpperCase() !== REPORTING_CURRENCY_CODE) {
    return true;
  }
  return Math.abs(exchangeRate - 1) < 0.0001;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
