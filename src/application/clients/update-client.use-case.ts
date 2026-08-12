import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import { DocumentTypeNotFoundError } from '../../domain/catalogs/catalog.errors';
import { type Client, type ClientType, hasValidIdentity } from '../../domain/clients/client.entity';
import {
  ClientNotFoundError,
  DuplicateClientDocumentError,
  InvalidClientIdentityError,
} from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface UpdateClientInput {
  readonly clientId: string;
  readonly clientType?: ClientType;
  readonly documentTypeId?: string;
  readonly documentNumber?: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly companyName?: string | null;
  readonly email?: string | null;
  readonly phone?: string;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly isActive?: boolean;
}

/**
 * Actualizacion parcial. La coherencia entre tipo de cliente y nombres se
 * verifica sobre el estado resultante (lo que viene en el request mezclado con
 * lo ya guardado), no solo sobre los campos enviados.
 */
export class UpdateClientUseCase implements UseCase<UpdateClientInput, Client> {
  constructor(
    private readonly clients: ClientRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(input: UpdateClientInput): Promise<Result<Client, DomainError>> {
    const existing = await this.clients.findById(input.clientId);
    if (existing === null) {
      return err(new ClientNotFoundError(input.clientId));
    }

    const merged = {
      clientType: input.clientType ?? existing.clientType,
      firstName: input.firstName !== undefined ? input.firstName : existing.firstName,
      lastName: input.lastName !== undefined ? input.lastName : existing.lastName,
      companyName: input.companyName !== undefined ? input.companyName : existing.companyName,
    };

    if (!hasValidIdentity(merged)) {
      return err(new InvalidClientIdentityError(merged.clientType));
    }

    if (
      input.documentTypeId !== undefined &&
      (await this.catalog.findDocumentTypeById(input.documentTypeId)) === null
    ) {
      return err(new DocumentTypeNotFoundError(input.documentTypeId));
    }

    const documentTypeId = input.documentTypeId ?? existing.documentTypeId;
    const documentNumber = input.documentNumber?.trim() ?? existing.documentNumber;

    if (
      (documentTypeId !== existing.documentTypeId || documentNumber !== existing.documentNumber) &&
      (await this.clients.existsByDocument(documentTypeId, documentNumber, input.clientId))
    ) {
      return err(new DuplicateClientDocumentError(documentNumber));
    }

    const updated = await this.clients.update(input.clientId, {
      ...(input.clientType !== undefined ? { clientType: input.clientType } : {}),
      ...(input.documentTypeId !== undefined ? { documentTypeId: input.documentTypeId } : {}),
      ...(input.documentNumber !== undefined ? { documentNumber } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
      ...(input.email !== undefined
        ? { email: input.email === null ? null : input.email.trim().toLowerCase() }
        : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (updated === null) {
      return err(new ClientNotFoundError(input.clientId));
    }

    return ok(updated);
  }
}
