import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { Supplier } from '../../domain/suppliers/supplier.entity';
import type {
  SupplierFilters,
  SupplierRepository,
} from '../../domain/suppliers/supplier.repository';
import type { UseCase } from '../shared/use-case';

export interface ListSuppliersInput {
  readonly filters: SupplierFilters;
  readonly page: PageQuery;
}

export class ListSuppliersUseCase
  implements UseCase<ListSuppliersInput, PaginatedResult<Supplier>>
{
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(
    input: ListSuppliersInput,
  ): Promise<Result<PaginatedResult<Supplier>, DomainError>> {
    return ok(await this.suppliers.list(input.filters, input.page));
  }
}
