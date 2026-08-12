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
