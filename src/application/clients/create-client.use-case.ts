import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import { DocumentTypeNotFoundError } from '../../domain/catalogs/catalog.errors';
import { type Client, type ClientType, hasValidIdentity } from '../../domain/clients/client.entity';
import {
  DuplicateClientDocumentError,
  InvalidClientIdentityError,
} from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface CreateClientInput {
  readonly clientType: ClientType;
  readonly documentTypeId: string;
  readonly documentNumber: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly companyName: string | null;
  readonly email: string | null;
  readonly phone: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly isActive: boolean;
}

export class CreateClientUseCase implements UseCase<CreateClientInput, Client> {
  constructor(
    private readonly clients: ClientRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(input: CreateClientInput): Promise<Result<Client, DomainError>> {
    if (!hasValidIdentity(input)) {
      return err(new InvalidClientIdentityError(input.clientType));
    }

    if ((await this.catalog.findDocumentTypeById(input.documentTypeId)) === null) {
      return err(new DocumentTypeNotFoundError(input.documentTypeId));
    }

    const documentNumber = input.documentNumber.trim();
    if (await this.clients.existsByDocument(input.documentTypeId, documentNumber)) {
      return err(new DuplicateClientDocumentError(documentNumber));
    }

    const client = await this.clients.create({
      clientType: input.clientType,
      documentTypeId: input.documentTypeId,
      documentNumber,
      firstName: trimOrNull(input.firstName),
      lastName: trimOrNull(input.lastName),
      companyName: trimOrNull(input.companyName),
      email: input.email === null ? null : input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: trimOrNull(input.address),
      city: trimOrNull(input.city),
      isActive: input.isActive,
    });

    return ok(client);
  }
}

function trimOrNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
