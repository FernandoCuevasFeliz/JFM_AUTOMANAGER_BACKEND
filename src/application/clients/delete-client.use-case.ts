import { ClientNotFoundError } from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeleteClientInput {
  readonly clientId: string;
}

/**
 * La accion de eliminar clientes es una desactivacion administrativa. Nunca
 * asigna `deleted_at`: el cliente y todo su historial siguen consultables y
 * puede reactivarse posteriormente desde la edicion.
 */
export class DeleteClientUseCase implements UseCase<DeleteClientInput, void> {
  constructor(private readonly clients: ClientRepository) {}

  async execute(input: DeleteClientInput): Promise<Result<void, DomainError>> {
    const client = await this.clients.findById(input.clientId);
    if (client === null) {
      return err(new ClientNotFoundError(input.clientId));
    }

    const deactivated = await this.clients.deactivate(input.clientId);
    if (!deactivated) {
      return err(new ClientNotFoundError(input.clientId));
    }

    return okVoid();
  }
}
