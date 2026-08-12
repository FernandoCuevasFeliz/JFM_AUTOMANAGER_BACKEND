import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type { NewSupplier, Supplier, SupplierUpdate } from './supplier.entity';

export interface SupplierFilters {
  readonly search?: string;
  readonly country?: string;
  readonly isActive?: boolean;
}

export interface SupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  existsByName(name: string, excludeSupplierId?: string): Promise<boolean>;
  list(filters: SupplierFilters, page: PageQuery): Promise<PaginatedResult<Supplier>>;
  create(data: NewSupplier): Promise<Supplier>;
  update(id: string, data: SupplierUpdate): Promise<Supplier | null>;
  softDelete(id: string): Promise<boolean>;
  countPurchases(supplierId: string): Promise<number>;
}
