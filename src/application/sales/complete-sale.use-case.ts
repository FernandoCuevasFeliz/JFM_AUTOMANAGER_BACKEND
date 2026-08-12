import { canTransitionSaleTo, isFullyPaid, type SaleWithDetails } from '../../domain/sales/sale.entity';
import {
  InvalidSaleStatusTransitionError,
  SaleNotFoundError,
  SaleNotFullyPaidError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface CompleteSaleInput {
  readonly saleId: string;
}

/**
 * Cierra la venta: la unidad se entrega al cliente.
 *
 * Solo se permite si la venta esta totalmente pagada. Es la regla que impide
 * entregar un vehiculo con saldo pendiente, que es exactamente el descontrol
 * que la empresa arrastra con las hojas de calculo.
 */
export class CompleteSaleUseCase implements UseCase<CompleteSaleInput, SaleWithDetails> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(input: CompleteSaleInput): Promise<Result<SaleWithDetails, DomainError>> {
    const sale = await this.sales.findById(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    if (!canTransitionSaleTo(sale.status, 'completed')) {
      return err(new InvalidSaleStatusTransitionError(sale.status, 'completed'));
    }

    const paid = await this.sales.totalPaid(input.saleId);
    if (!isFullyPaid(sale.salePrice, paid)) {
      return err(new SaleNotFullyPaidError(sale.salePrice, paid));
    }

    await this.sales.updateStatus(input.saleId, 'completed');

    const updated = await this.sales.findByIdWithDetails(input.saleId);
    if (updated === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return ok(updated);
  }
}
