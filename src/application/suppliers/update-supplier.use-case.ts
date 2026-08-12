import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Supplier } from '../../domain/suppliers/supplier.entity';
import {
  DuplicateSupplierNameError,
  SupplierNotFoundError,
} from '../../domain/suppliers/supplier.errors';
import type { SupplierRepository } from '../../domain/suppliers/supplier.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdateSupplierInput {
  readonly supplierId: string;
  readonly name?: string;
  readonly contactName?: string | null;
  readonly documentNumber?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly country?: string | null;
  readonly isActive?: boolean;
}

export class UpdateSupplierUseCase implements UseCase<UpdateSupplierInput, Supplier> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: UpdateSupplierInput): Promise<Result<Supplier, DomainError>> {
    const existing = await this.suppliers.findById(input.supplierId);
    if (existing === null) {
      return err(new SupplierNotFoundError(input.supplierId));
    }

    const name = input.name?.trim();
    if (
      name !== undefined &&
      name !== existing.name &&
      (await this.suppliers.existsByName(name, input.supplierId))
    ) {
      return err(new DuplicateSupplierNameError(name));
    }

    const updated = await this.suppliers.update(input.supplierId, {
      ...(name !== undefined ? { name } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
      ...(input.email !== undefined
        ? { email: input.email === null ? null : input.email.trim().toLowerCase() }
        : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (updated === null) {
      return err(new SupplierNotFoundError(input.supplierId));
    }

    return ok(updated);
  }
}
