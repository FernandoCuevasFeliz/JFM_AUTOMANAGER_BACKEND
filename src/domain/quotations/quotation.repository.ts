import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type {
  NewQuotation,
  Quotation,
  QuotationStatus,
  QuotationUpdate,
  QuotationWithDetails,
} from './quotation.entity';

export interface QuotationFilters {
  readonly search?: string;
  readonly clientId?: string;
  readonly vehicleId?: string;
  readonly status?: QuotationStatus;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface QuotationRepository {
  findById(id: string): Promise<Quotation | null>;
  findByIdWithDetails(id: string): Promise<QuotationWithDetails | null>;
  existsByNumber(quotationNumber: string): Promise<boolean>;
  list(filters: QuotationFilters, page: PageQuery): Promise<PaginatedResult<QuotationWithDetails>>;
  create(data: NewQuotation): Promise<Quotation>;
  update(id: string, data: QuotationUpdate): Promise<Quotation | null>;
  updateStatus(id: string, status: QuotationStatus): Promise<Quotation | null>;
  softDelete(id: string): Promise<boolean>;
  /** Marca como vencidas las cotizaciones cuya validez ya paso. Devuelve cuantas. */
  expireOverdue(today: string): Promise<number>;
  /** Ultimo correlativo emitido en el ano, para generar el siguiente numero. */
  lastNumberForYear(yearPrefix: string): Promise<string | null>;
}
