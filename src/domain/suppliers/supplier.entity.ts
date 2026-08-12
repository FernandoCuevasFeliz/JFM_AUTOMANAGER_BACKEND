export interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly documentNumber: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly country: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface NewSupplier {
  readonly name: string;
  readonly contactName: string | null;
  readonly documentNumber: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly country: string | null;
  readonly isActive: boolean;
}

export interface SupplierUpdate {
  readonly name?: string;
  readonly contactName?: string | null;
  readonly documentNumber?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly country?: string | null;
  readonly isActive?: boolean;
}
