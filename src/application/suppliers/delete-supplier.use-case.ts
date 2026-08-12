import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import {
  SupplierHasPurchasesError,
  SupplierNotFoundError,
} from '../../domain/suppliers/supplier.errors';
import type { SupplierRepository } from '../../domain/suppliers/supplier.repository';
import type { UseCase } from '../shared/use-case';

export interface DeleteSupplierInput {
  readonly supplierId: string;
}

export class DeleteSupplierUseCase implements UseCase<DeleteSupplierInput, void> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: DeleteSupplierInput): Promise<Result<void, DomainError>> {
    const supplier = await this.suppliers.findById(input.supplierId);
    if (supplier === null) {
      return err(new SupplierNotFoundError(input.supplierId));
    }

    if ((await this.suppliers.countPurchases(input.supplierId)) > 0) {
      return err(new SupplierHasPurchasesError(input.supplierId));
    }

    const deleted = await this.suppliers.softDelete(input.supplierId);
    if (!deleted) {
      return err(new SupplierNotFoundError(input.supplierId));
    }

    return okVoid();
  }
}
