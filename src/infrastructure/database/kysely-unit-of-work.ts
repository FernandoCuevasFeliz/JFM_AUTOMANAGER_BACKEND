import type { Result } from '../../domain/shared/result';
import {
  RollbackSignal,
  rollbackToResult,
  type TransactionalContext,
  type UnitOfWork,
} from '../../domain/shared/unit-of-work';
import { KyselyClientRepository } from '../repositories/kysely-client.repository';
import { KyselyExpenseRepository } from '../repositories/kysely-expense.repository';
import { KyselyPurchaseRepository } from '../repositories/kysely-purchase.repository';
import { KyselyQuotationRepository } from '../repositories/kysely-quotation.repository';
import { KyselyReservationRepository } from '../repositories/kysely-reservation.repository';
import { KyselySaleRepository } from '../repositories/kysely-sale.repository';
import { KyselyVehicleRepository } from '../repositories/kysely-vehicle.repository';
import type { Database, Executor } from './connection';

/** Construye el juego completo de repositorios sobre un ejecutor dado. */
export function buildRepositories(executor: Executor): TransactionalContext {
  return {
    vehicles: new KyselyVehicleRepository(executor),
    clients: new KyselyClientRepository(executor),
    purchases: new KyselyPurchaseRepository(executor),
    expenses: new KyselyExpenseRepository(executor),
    quotations: new KyselyQuotationRepository(executor),
    reservations: new KyselyReservationRepository(executor),
    sales: new KyselySaleRepository(executor),
  };
}

/**
 * Implementacion de la frontera transaccional sobre `db.transaction()`.
 *
 * Un `Err` devuelto por el trabajo se convierte en una excepcion interna
 * (`RollbackSignal`) para que Kysely emita el ROLLBACK, y se vuelve a
 * convertir en `Err` al salir. De ese modo el caso de uso trabaja siempre con
 * `Result` y aun asi la transaccion se revierte de verdad.
 */
export class KyselyUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  async run<T, E>(
    work: (ctx: TransactionalContext) => Promise<Result<T, E>>,
  ): Promise<Result<T, E>> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const result = await work(buildRepositories(trx));
        if (!result.ok) {
          throw new RollbackSignal(result.error);
        }
        return result;
      });
    } catch (error) {
      return rollbackToResult<T, E>(error);
    }
  }
}
