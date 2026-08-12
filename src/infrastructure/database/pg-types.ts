import pg from 'pg';

/**
 * Ajustes al parser de tipos de `node-postgres`.
 *
 * Por defecto `pg` devuelve NUMERIC como string (para no perder precision
 * arbitraria) y DATE como `Date` en la zona horaria local (lo que provoca
 * corrimientos de un dia). Ninguno de los dos comportamientos sirve aqui:
 *
 * - NUMERIC(12,2) / NUMERIC(10,4): montos y tasas del negocio. El mayor valor
 *   representable es 9_999_999_999.99, muy por debajo de Number.MAX_SAFE_INTEGER
 *   incluso multiplicado por 100, asi que `number` es seguro para 2 decimales.
 * - DATE: es una fecha civil sin hora (fecha de compra, de venta, vencimiento).
 *   Se mantiene como string `YYYY-MM-DD`, que es exactamente lo que viaja por
 *   la API y lo que espera Postgres al escribir.
 *
 * Debe importarse UNA vez, antes de abrir el pool.
 */
export function configurePgTypeParsers(): void {
  const builtins = pg.types.builtins;

  // NUMERIC / DECIMAL -> number
  pg.types.setTypeParser(builtins.NUMERIC, (value: string) => Number.parseFloat(value));

  // BIGINT (COUNT(*), SUM sobre enteros) -> number
  pg.types.setTypeParser(builtins.INT8, (value: string) => Number.parseInt(value, 10));

  // DATE -> string 'YYYY-MM-DD' sin conversion de zona horaria
  pg.types.setTypeParser(builtins.DATE, (value: string) => value);
}
