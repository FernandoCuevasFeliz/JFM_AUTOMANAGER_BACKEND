/** Usuario del sistema (empleado de EJGH Auto Import). */
export interface User {
  readonly id: string;
  readonly roleId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** Hash bcrypt. Nunca debe cruzar hacia `presentation`. */
  readonly passwordHash: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/** Usuario con el nombre de su rol resuelto (para JWT y respuestas HTTP). */
export interface UserWithRole extends User {
  readonly roleName: string;
}

export interface NewUser {
  readonly roleId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly phone: string | null;
  readonly isActive: boolean;
}

export interface UserUpdate {
  readonly roleId?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly passwordHash?: string;
  readonly phone?: string | null;
  readonly isActive?: boolean;
}

/**
 * Un usuario borrado logicamente o desactivado no puede iniciar sesion.
 * Es la unica invariante de autenticacion que vive en el dominio: la
 * verificacion de la contrasena depende de un puerto (`PasswordHasher`).
 */
export function canAuthenticate(user: User): boolean {
  return user.isActive && user.deletedAt === null;
}

export function fullName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/** Proyeccion segura: todo el usuario menos el hash de la contrasena. */
export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
