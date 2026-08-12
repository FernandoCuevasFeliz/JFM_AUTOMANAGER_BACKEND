import {
  pendingBalance,
  type SalePaymentWithDetails,
  totalPaid as sumPayments,
} from '../../domain/sales/sale.entity';
import { SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface ListSalePaymentsInput {
  readonly saleId: string;
}

export interface ListSalePaymentsOutput {
  readonly payments: SalePaymentWithDetails[];
  readonly salePrice: number;
  readonly totalPaid: number;
  readonly pendingBalance: number;
}

/** Estado de cuenta de una venta. */
export class ListSalePaymentsUseCase
  implements UseCase<ListSalePaymentsInput, ListSalePaymentsOutput>
{
  constructor(private readonly sales: SaleRepository) {}

  async execute(
    input: ListSalePaymentsInput,
  ): Promise<Result<ListSalePaymentsOutput, DomainError>> {
    const sale = await this.sales.findById(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    const payments = await this.sales.listPayments(input.saleId);
    const paid = sumPayments(payments);

    return ok({
      payments,
      salePrice: sale.salePrice,
      totalPaid: paid,
      pendingBalance: pendingBalance(sale.salePrice, paid),
    });
  }
}
