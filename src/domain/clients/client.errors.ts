import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';

export class ClientNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Cliente', identifier);
  }
}

export class DuplicateClientDocumentError extends ConflictError {
  constructor(documentNumber: string) {
    super(`Ya existe un cliente con el documento ${documentNumber} para ese tipo de documento`, {
      field: 'documentNumber',
      documentNumber,
    });
  }
}

export class InvalidClientIdentityError extends BusinessRuleError {
  constructor(clientType: 'individual' | 'company') {
    super(
      clientType === 'individual'
        ? 'Un cliente de tipo persona requiere nombre y apellido'
        : 'Un cliente de tipo empresa requiere razon social',
      { clientType },
    );
  }
}

export class ClientHasCommercialHistoryError extends BusinessRuleError {
  constructor(clientId: string, reason: string) {
    super(`No se puede eliminar el cliente: ${reason}`, { clientId });
  }
}

export class InactiveClientError extends BusinessRuleError {
  constructor(clientId: string) {
    super('El cliente esta inactivo y no puede participar en operaciones comerciales', {
      clientId,
    });
  }
}
