import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Supplier } from '../../domain/suppliers/supplier.entity';
import { SupplierNotFoundError } from '../../domain/suppliers/supplier.errors';
import type { SupplierRepository } from '../../domain/suppliers/supplier.repository';
import type { UseCase } from '../shared/use-case';

export interface GetSupplierInput {
  readonly supplierId: string;
}

export class GetSupplierUseCase implements UseCase<GetSupplierInput, Supplier> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: GetSupplierInput): Promise<Result<Supplier, DomainError>> {
    const supplier = await this.suppliers.findById(input.supplierId);
    if (supplier === null) {
      return err(new SupplierNotFoundError(input.supplierId));
    }
    return ok(supplier);
  }
}
