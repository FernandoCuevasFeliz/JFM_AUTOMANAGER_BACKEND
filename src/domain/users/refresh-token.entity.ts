/**
 * Sesion persistente de un usuario.
 *
 * El token en claro solo existe en la respuesta HTTP y en el cliente; aqui se
 * guarda su hash, igual que con las contrasenas.
 */
export interface RefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewRefreshToken {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

/** Datos de la sesion que se pueden mostrar al usuario. */
export interface ActiveSession {
  readonly id: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export function isRefreshTokenUsable(token: RefreshToken, now: Date): boolean {
  return token.revokedAt === null && token.expiresAt.getTime() > now.getTime();
}

export function isRefreshTokenExpired(token: RefreshToken, now: Date): boolean {
  return token.expiresAt.getTime() <= now.getTime();
}

/**
 * Puerto de generacion y verificacion del secreto de refresco.
 *
 * El dominio no sabe que se usa `crypto.randomBytes` ni SHA-256: solo necesita
 * poder crear un secreto imposible de adivinar y derivar de forma
 * determinista el hash que se compara contra la base.
 */
export interface RefreshTokenGenerator {
  /** Secreto opaco en claro, para entregarselo al cliente una unica vez. */
  generate(): string;
  /** Hash determinista del secreto, que es lo unico que se persiste. */
  hash(token: string): string;
}
