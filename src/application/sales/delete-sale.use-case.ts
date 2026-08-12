import { SaleNotEditableError, SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, okVoid, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface DeleteSaleInput {
  readonly saleId: string;
}

/**
 * Archiva una venta cancelada (borrado logico).
 *
 * Solo se admiten ventas ya canceladas: cancelar es lo que revierte el efecto
 * sobre el inventario, y solo despues tiene sentido sacar el documento de las
 * listas de trabajo.
 *
 * Con el indice unico parcial `uq_sales_vehicle_active` (migracion 003), este
 * borrado ya NO es necesario para revender el vehiculo: cancelar la venta basta.
 * Queda como limpieza de documentos anulados, y por eso es logico y no fisico:
 * los pagos ya cobrados y devueltos siguen siendo consultables.
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

    const deleted = await this.sales.softDelete(input.saleId);
    if (!deleted) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return okVoid();
  }
}
