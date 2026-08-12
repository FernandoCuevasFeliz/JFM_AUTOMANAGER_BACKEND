import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { type PublicUser, toPublicUser } from '../../domain/users/user.entity';
import { UserNotFoundError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface GetUserInput {
  readonly userId: string;
}

export type GetUserOutput = PublicUser & { readonly roleName: string };

export class GetUserUseCase implements UseCase<GetUserInput, GetUserOutput> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: GetUserInput): Promise<Result<GetUserOutput, DomainError>> {
    const user = await this.users.findByIdWithRole(input.userId);
    if (user === null) {
      return err(new UserNotFoundError(input.userId));
    }
    return ok({ ...toPublicUser(user), roleName: user.roleName });
  }
}
