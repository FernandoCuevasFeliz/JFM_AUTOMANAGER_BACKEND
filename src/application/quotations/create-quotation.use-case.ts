import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import { CurrencyNotFoundError } from '../../domain/catalogs/catalog.errors';
import { ClientNotFoundError, InactiveClientError } from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import type { QuotationWithDetails } from '../../domain/quotations/quotation.entity';
import {
  QuotationNotFoundError,
  QuotationValidityDateError,
} from '../../domain/quotations/quotation.errors';
import type { QuotationRepository } from '../../domain/quotations/quotation.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { isQuotable } from '../../domain/vehicles/vehicle.entity';
import { VehicleNotFoundError, VehicleNotQuotableError } from '../../domain/vehicles/vehicle.errors';
import type { VehicleRepository } from '../../domain/vehicles/vehicle.repository';
import { documentYearPrefix, nextDocumentNumber, yearOf } from '../shared/document-number';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreateQuotationInput extends ActorInput {
  readonly clientId: string;
  readonly vehicleId: string;
  readonly currencyId: string;
  readonly quotedPrice: number;
  readonly validUntil: string;
  readonly notes: string | null;
}

/**
 * Primer paso del ciclo comercial: cotizar un vehiculo a un cliente.
 *
 * Se puede cotizar cualquier vehiculo que no este vendido, incluidos los que
 * aun estan en transito: la empresa vende unidades antes de que lleguen al
 * pais. Lo que no se puede es cotizar algo ya vendido.
 */
export class CreateQuotationUseCase
  implements UseCase<CreateQuotationInput, QuotationWithDetails>
{
  constructor(
    private readonly quotations: QuotationRepository,
    private readonly clients: ClientRepository,
    private readonly vehicles: VehicleRepository,
    private readonly catalog: CatalogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateQuotationInput): Promise<Result<QuotationWithDetails, DomainError>> {
    if (input.validUntil < this.clock.today()) {
      return err(new QuotationValidityDateError());
    }

    const client = await this.clients.findById(input.clientId);
    if (client === null) {
      return err(new ClientNotFoundError(input.clientId));
    }
    if (!client.isActive) {
      return err(new InactiveClientError(input.clientId));
    }

    const vehicle = await this.vehicles.findById(input.vehicleId);
    if (vehicle === null) {
      return err(new VehicleNotFoundError(input.vehicleId));
    }
    if (!isQuotable(vehicle)) {
      return err(new VehicleNotQuotableError(input.vehicleId, vehicle.status));
    }

    if ((await this.catalog.findCurrencyById(input.currencyId)) === null) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }

    const year = yearOf(this.clock.today());
    const lastNumber = await this.quotations.lastNumberForYear(documentYearPrefix('quotation', year));

    const quotation = await this.quotations.create({
      quotationNumber: nextDocumentNumber('quotation', year, lastNumber),
      clientId: input.clientId,
      vehicleId: input.vehicleId,
      currencyId: input.currencyId,
      quotedPrice: input.quotedPrice,
      validUntil: input.validUntil,
      status: 'pending',
      createdBy: input.actorUserId,
      notes: input.notes,
    });

    const created = await this.quotations.findByIdWithDetails(quotation.id);
    if (created === null) {
      return err(new QuotationNotFoundError(quotation.id));
    }

    return ok(created);
  }
}
