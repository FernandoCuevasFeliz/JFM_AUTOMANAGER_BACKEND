/**
 * Generacion de correlativos de documentos comerciales.
 *
 * Formato: `PREFIJO-ANO-SECUENCIA` con la secuencia a 6 digitos
 * (`COT-2026-000042`). La secuencia se reinicia cada ano, que es como la
 * empresa numera sus documentos en las hojas de calculo actuales.
 *
 * El siguiente numero se deriva del ultimo emitido en el ano, que el
 * repositorio obtiene con `ORDER BY numero DESC LIMIT 1`. Al insertarse dentro
 * de la misma transaccion que el documento, y estando la columna protegida por
 * un UNIQUE, dos peticiones simultaneas no pueden quedarse con el mismo numero:
 * la segunda choca con el unico y se reintenta.
 */
export const DOCUMENT_PREFIXES = {
  purchase: 'COM',
  quotation: 'COT',
  reservation: 'RES',
  sale: 'VEN',
} as const;

export type DocumentKind = keyof typeof DOCUMENT_PREFIXES;

const SEQUENCE_LENGTH = 6;

export function documentYearPrefix(kind: DocumentKind, year: number): string {
  return `${DOCUMENT_PREFIXES[kind]}-${year}-`;
}

export function buildDocumentNumber(kind: DocumentKind, year: number, sequence: number): string {
  return `${documentYearPrefix(kind, year)}${String(sequence).padStart(SEQUENCE_LENGTH, '0')}`;
}

/**
 * @param lastNumber ultimo numero emitido para ese tipo y ano, o `null` si es
 *                   el primero del ano.
 */
export function nextDocumentNumber(
  kind: DocumentKind,
  year: number,
  lastNumber: string | null,
): string {
  const sequence = lastNumber === null ? 1 : parseSequence(lastNumber) + 1;
  return buildDocumentNumber(kind, year, sequence);
}

function parseSequence(documentNumber: string): number {
  const tail = documentNumber.slice(documentNumber.lastIndexOf('-') + 1);
  const parsed = Number.parseInt(tail, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function yearOf(dateOnly: string): number {
  return Number.parseInt(dateOnly.slice(0, 4), 10);
}
