import type { ClientWithDetails } from '../../domain/clients/client.entity';
import { ClientNotFoundError } from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetClientInput {
  readonly clientId: string;
}

export class GetClientUseCase implements UseCase<GetClientInput, ClientWithDetails> {
  constructor(private readonly clients: ClientRepository) {}

  async execute(input: GetClientInput): Promise<Result<ClientWithDetails, DomainError>> {
    const client = await this.clients.findByIdWithDetails(input.clientId);
    if (client === null) {
      return err(new ClientNotFoundError(input.clientId));
    }
    return ok(client);
  }
}
