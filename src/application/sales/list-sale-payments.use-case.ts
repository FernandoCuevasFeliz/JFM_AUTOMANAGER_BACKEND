import {
  netPaid,
  pendingBalance,
  type RefundWithDetails,
  type SalePaymentWithDetails,
  totalPaid as sumPayments,
  totalRefunded as sumRefunds,
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
  readonly refunds: RefundWithDetails[];
  readonly salePrice: number;
  readonly totalPaid: number;
  readonly totalRefunded: number;
  readonly netPaid: number;
  readonly pendingBalance: number;
}

/**
 * Estado de cuenta de una venta: lo que entro, lo que se devolvio y lo que
 * queda. Los reembolsos van en el mismo estado de cuenta porque sin ellos el
 * saldo no cuadra con lo que el cliente realmente debe.
 */
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
    const refunds = await this.sales.listRefunds(input.saleId);
    const paid = sumPayments(payments);
    const refunded = sumRefunds(refunds);
    const net = netPaid(paid, refunded);

    return ok({
      payments,
      refunds,
      salePrice: sale.salePrice,
      totalPaid: paid,
      totalRefunded: refunded,
      netPaid: net,
      pendingBalance: pendingBalance(sale.salePrice, net),
    });
  }
}
