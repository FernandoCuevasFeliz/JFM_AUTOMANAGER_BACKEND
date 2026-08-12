import { SaleNotEditableError, SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeleteSaleInput {
  readonly saleId: string;
}

/**
 * Elimina una venta ya cancelada para liberar el vehiculo.
 *
 * `sales.vehicle_id` es UNIQUE sin condicion, de modo que un registro de venta
 * cancelado (o borrado logicamente, que para la base sigue siendo una fila)
 * impide registrar una venta nueva sobre ese vehiculo. Por eso este es el
 * unico borrado fisico del sistema, y solo aplica a ventas canceladas; sus
 * pagos se eliminan en cascada.
 *
 * La alternativa es cambiar el UNIQUE por un indice unico parcial que ignore
 * las canceladas; esta propuesto en el README pero no aplicado, para no tocar
 * el esquema entregado.
 */
export class DeleteSaleUseCase implements UseCase<DeleteSaleInput, void> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(input: DeleteSaleInput): Promise<Result<void, DomainError>> {
    const sale = await this.sales.findById(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    if (sale.status !== 'cancelled') {
      return err(new SaleNotEditableError(sale.status));
    }

    const deleted = await this.sales.hardDelete(input.saleId);
    if (!deleted) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return okVoid();
  }
}
