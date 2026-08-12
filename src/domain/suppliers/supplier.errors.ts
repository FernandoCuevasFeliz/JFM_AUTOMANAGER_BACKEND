import { BusinessRuleError, ConflictError, NotFoundError } from '../shared/domain-error';

export class SupplierNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Proveedor', identifier);
  }
}

/**
 * La base no impone un unico sobre `suppliers.name`, pero registrar dos veces
 * al mismo proveedor rompe el historial de compras, asi que la unicidad se
 * valida en el dominio.
 */
export class DuplicateSupplierNameError extends ConflictError {
  constructor(name: string) {
    super(`Ya existe un proveedor registrado con el nombre ${name}`, { field: 'name', name });
  }
}

export class SupplierHasPurchasesError extends BusinessRuleError {
  constructor(supplierId: string) {
    super('No se puede eliminar el proveedor: tiene compras registradas', { supplierId });
  }
}

export class InactiveSupplierError extends BusinessRuleError {
  constructor(supplierId: string) {
    super('El proveedor esta inactivo y no puede recibir nuevas compras', { supplierId });
  }
}
