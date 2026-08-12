/**
 * Puerto de tiempo. Los casos de uso no llaman a `new Date()` directamente:
 * dependen de este puerto para poder fijar la fecha en los tests.
 */
export interface Clock {
  now(): Date;
  /** Fecha civil de hoy en formato `YYYY-MM-DD` (la que usan las columnas DATE). */
  today(): string;
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
