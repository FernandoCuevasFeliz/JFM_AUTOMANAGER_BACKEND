import { BusinessRuleError, ConflictError, NotFoundError, UnauthorizedError } from '../shared/domain-error';

export class UserNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Usuario', identifier);
  }
}

export class EmailAlreadyInUseError extends ConflictError {
  constructor(email: string) {
    super(`Ya existe un usuario registrado con el correo ${email}`, { field: 'email', email });
  }
}

/**
 * Mensaje deliberadamente generico: no revela si el correo existe o si lo que
 * fallo fue la contrasena.
 */
export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Correo o contrasena incorrectos');
  }
}

export class InactiveUserError extends UnauthorizedError {
  constructor() {
    super('El usuario esta inactivo. Contacte al administrador');
  }
}

export class RoleNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Rol', identifier);
  }
}

export class CannotDeleteSelfError extends BusinessRuleError {
  constructor() {
    super('Un usuario no puede eliminar su propia cuenta');
  }
}

export class SamePasswordError extends BusinessRuleError {
  constructor() {
    super('La nueva contrasena debe ser distinta de la actual');
  }
}

/**
 * El refresh token no existe, expiro o ya fue revocado. Igual que en el login,
 * el mensaje no distingue entre los tres casos.
 */
export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('La sesion no es valida o expiro. Inicie sesion de nuevo');
  }
}

/**
 * Se presento un refresh token ya rotado. Como cada token es de un solo uso,
 * que reaparezca significa que alguien conserva una copia: se cierran todas las
 * sesiones del usuario por precaucion.
 */
export class RefreshTokenReuseDetectedError extends UnauthorizedError {
  constructor() {
    super(
      'Se detecto un uso indebido de la sesion. Por seguridad se cerraron todas las sesiones activas',
    );
  }
}
