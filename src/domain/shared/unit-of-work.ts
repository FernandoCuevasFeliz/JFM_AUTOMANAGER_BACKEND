import type { ClientRepository } from '../clients/client.repository';
import type { ExpenseRepository } from '../expenses/expense.repository';
import type { PurchaseRepository } from '../purchases/purchase.repository';
import type { QuotationRepository } from '../quotations/quotation.repository';
import type { ReservationRepository } from '../reservations/reservation.repository';
import type { SaleRepository } from '../sales/sale.repository';
import type { VehicleRepository } from '../vehicles/vehicle.repository';
import { err, type Result } from './result';

/**
 * Repositorios que participan de una misma transaccion. Dentro de
 * `UnitOfWork.run` se debe usar EXCLUSIVAMENTE esta coleccion: los
 * repositorios inyectados en el constructor del caso de uso trabajan fuera de
 * la transaccion y sus escrituras no se revertirian.
 */
export interface TransactionalContext {
  readonly vehicles: VehicleRepository;
  readonly clients: ClientRepository;
  readonly purchases: PurchaseRepository;
  readonly expenses: ExpenseRepository;
  readonly quotations: QuotationRepository;
  readonly reservations: ReservationRepository;
  readonly sales: SaleRepository;
}

/**
 * Frontera transaccional.
 *
 * El trabajo devuelve un `Result`: si es `Err` la transaccion se revierte y el
 * error se propaga como valor (no como excepcion). Asi un caso de uso como
 * `create-sale` puede validar en medio de la transaccion, abortar y seguir
 * respondiendo con un error de dominio tipado.
 */
export interface UnitOfWork {
  run<T, E>(work: (ctx: TransactionalContext) => Promise<Result<T, E>>): Promise<Result<T, E>>;
}

/**
 * Excepcion interna que la implementacion usa para forzar el ROLLBACK cuando
 * el trabajo devuelve `Err`. Nunca sale de `UnitOfWork.run`.
 */
export class RollbackSignal<E> extends Error {
  constructor(readonly reason: E) {
    super('Transaccion revertida por un error de negocio');
    this.name = 'RollbackSignal';
  }
}

export function rollbackToResult<T, E>(error: unknown): Result<T, E> {
  if (error instanceof RollbackSignal) {
    return err(error.reason as E);
  }
  throw error;
}
