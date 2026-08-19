import {
  isItemActive,
  isSaleEditable,
  netPaid,
  saleTotal,
  type SaleWithDetails,
} from '../../domain/sales/sale.entity';
import {
  PaymentExceedsBalanceError,
  SaleItemAlreadyReturnedError,
  SaleItemDoesNotBelongToSaleError,
  SaleItemNotFoundError,
  SaleNotEditableError,
  SaleNotFoundError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface UpdateSaleItemInput {
  readonly saleId: string;
  readonly saleItemId: string;
  readonly salePrice: number;
}

/**
 * Corrige el precio pactado de una unidad de la venta.
 *
 * El control es sobre el TOTAL resultante, no sobre la linea: bajar el precio de
 * un vehiculo puede dejar la venta por debajo de lo ya cobrado, y eso seria un
 * saldo negativo. Se compara contra el cobrado neto de reembolsos, que es el
 * dinero que la empresa realmente retiene.
 *
 * Una linea devuelta ya no se toca: su precio es parte del historico de la
 * devolucion y de la nota de credito que la acompana.
 */
export class UpdateSaleItemUseCase implements UseCase<UpdateSaleItemInput, SaleWithDetails> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(input: UpdateSaleItemInput): Promise<Result<SaleWithDetails, DomainError>> {
    const sale = await this.sales.findById(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }
    if (!isSaleEditable(sale)) {
      return err(new SaleNotEditableError(sale.status));
    }

    const item = sale.items.find((candidate) => candidate.id === input.saleItemId);
    if (item === undefined) {
      const exists = await this.sales.findItemById(input.saleItemId);
      return err(
        exists === null
          ? new SaleItemNotFoundError(input.saleItemId)
          : new SaleItemDoesNotBelongToSaleError(input.saleItemId, input.saleId),
      );
    }
    if (!isItemActive(item)) {
      return err(new SaleItemAlreadyReturnedError(input.saleItemId));
    }

    const newTotal = saleTotal(
      sale.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, salePrice: input.salePrice } : candidate,
      ),
    );

    const paid = netPaid(
      await this.sales.totalPaid(input.saleId),
      await this.sales.totalRefunded(input.saleId),
    );

    if (newTotal + 0.01 < paid) {
      return err(new PaymentExceedsBalanceError(paid, newTotal));
    }

    await this.sales.updateItemPrice(input.saleItemId, input.salePrice);

    const updated = await this.sales.findByIdWithDetails(input.saleId);
    if (updated === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return ok(updated);
  }
}
