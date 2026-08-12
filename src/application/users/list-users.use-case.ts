import type { DomainError } from '../../domain/shared/domain-error';
import type { PageQuery, PaginatedResult } from '../../domain/shared/pagination';
import { ok, type Result } from '../../domain/shared/result';
import { toPublicUser } from '../../domain/users/user.entity';
import type { UserFilters, UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';
import type { GetUserOutput } from './get-user.use-case';

export interface ListUsersInput {
  readonly filters: UserFilters;
  readonly page: PageQuery;
}

export class ListUsersUseCase
  implements UseCase<ListUsersInput, PaginatedResult<GetUserOutput>>
{
  constructor(private readonly users: UserRepository) {}

  async execute(
    input: ListUsersInput,
  ): Promise<Result<PaginatedResult<GetUserOutput>, DomainError>> {
    const result = await this.users.list(input.filters, input.page);
    return ok({
      ...result,
      items: result.items.map((user) => ({ ...toPublicUser(user), roleName: user.roleName })),
    });
  }
}
