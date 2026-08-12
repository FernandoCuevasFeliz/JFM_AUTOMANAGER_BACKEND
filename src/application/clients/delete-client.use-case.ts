import {
  ClientHasCommercialHistoryError,
  ClientNotFoundError,
} from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeleteClientInput {
  readonly clientId: string;
}

/**
 * Borrado logico. Se rechaza si el cliente tiene cotizaciones, reservas o
 * ventas: esas tablas lo referencian con RESTRICT y su historial comercial
 * debe seguir siendo consultable. Para sacarlo de circulacion se usa
 * `isActive = false`.
 */
export class DeleteClientUseCase implements UseCase<DeleteClientInput, void> {
  constructor(private readonly clients: ClientRepository) {}

  async execute(input: DeleteClientInput): Promise<Result<void, DomainError>> {
    const client = await this.clients.findById(input.clientId);
    if (client === null) {
      return err(new ClientNotFoundError(input.clientId));
    }

    const commercialRecords = await this.clients.countCommercialRecords(input.clientId);
    if (commercialRecords > 0) {
      return err(
        new ClientHasCommercialHistoryError(
          input.clientId,
          `tiene ${commercialRecords} operacion(es) comercial(es) registrada(s). Desactivelo en lugar de eliminarlo`,
        ),
      );
    }

    const deleted = await this.clients.softDelete(input.clientId);
    if (!deleted) {
      return err(new ClientNotFoundError(input.clientId));
    }

    return okVoid();
  }
}
