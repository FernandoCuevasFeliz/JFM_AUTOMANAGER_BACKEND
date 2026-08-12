import type { ClientWithDetails } from '../../domain/clients/client.entity';
import type { ClientFilters, ClientRepository } from '../../domain/clients/client.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListClientsInput {
  readonly filters: ClientFilters;
  readonly page: PageQuery;
}

export class ListClientsUseCase
  implements UseCase<ListClientsInput, PaginatedResult<ClientWithDetails>>
{
  constructor(private readonly clients: ClientRepository) {}

  async execute(
    input: ListClientsInput,
  ): Promise<Result<PaginatedResult<ClientWithDetails>, DomainError>> {
    return ok(await this.clients.list(input.filters, input.page));
  }
}
