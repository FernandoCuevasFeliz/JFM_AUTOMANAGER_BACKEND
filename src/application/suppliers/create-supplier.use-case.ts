import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { Supplier } from '../../domain/suppliers/supplier.entity';
import { DuplicateSupplierNameError } from '../../domain/suppliers/supplier.errors';
import type { SupplierRepository } from '../../domain/suppliers/supplier.repository';
import type { UseCase } from '../shared/use-case';

export interface CreateSupplierInput {
  readonly name: string;
  readonly contactName: string | null;
  readonly documentNumber: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly country: string | null;
  readonly isActive: boolean;
}

export class CreateSupplierUseCase implements UseCase<CreateSupplierInput, Supplier> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: CreateSupplierInput): Promise<Result<Supplier, DomainError>> {
    const name = input.name.trim();
    if (await this.suppliers.existsByName(name)) {
      return err(new DuplicateSupplierNameError(name));
    }

    const supplier = await this.suppliers.create({
      name,
      contactName: input.contactName,
      documentNumber: input.documentNumber,
      email: input.email === null ? null : input.email.trim().toLowerCase(),
      phone: input.phone,
      address: input.address,
      country: input.country,
      isActive: input.isActive,
    });

    return ok(supplier);
  }
}
