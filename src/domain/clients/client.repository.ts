import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type { Client, ClientType, ClientUpdate, ClientWithDetails, NewClient } from './client.entity';

export interface ClientFilters {
  /** Busqueda libre sobre nombre, razon social, documento, telefono y correo. */
  readonly search?: string;
  readonly clientType?: ClientType;
  readonly city?: string;
  readonly isActive?: boolean;
}

export interface ClientRepository {
  findById(id: string): Promise<Client | null>;
  findByIdWithDetails(id: string): Promise<ClientWithDetails | null>;
  existsByDocument(
    documentTypeId: string,
    documentNumber: string,
    excludeClientId?: string,
  ): Promise<boolean>;
  list(filters: ClientFilters, page: PageQuery): Promise<PaginatedResult<ClientWithDetails>>;
  create(data: NewClient): Promise<Client>;
  update(id: string, data: ClientUpdate): Promise<Client | null>;
  softDelete(id: string): Promise<boolean>;
  /** Cotizaciones, reservas o ventas asociadas; bloquea el borrado logico. */
  countCommercialRecords(clientId: string): Promise<number>;
}
