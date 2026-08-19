import {
  activeItems,
  isItemActive,
  isSaleEditable,
  netPaid,
  saleTotal,
  type SaleWithDetails,
} from '../../domain/sales/sale.entity';
import {
  LastSaleItemError,
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
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { UseCase } from '../shared/use-case';

export interface RemoveSaleItemInput {
  readonly saleId: string;
  readonly saleItemId: string;
}

/**
 * Quita un vehiculo agregado por ERROR a una venta todavia en proceso.
 *
 * No confundir con devolver: quitar borra la linea porque nunca debio existir,
 * y por eso solo se admite mientras la venta este `in_process`. Si el vehiculo
 * llego a entregarse, o la venta ya se completo, lo que corresponde es
 * `return-sale-item`, que conserva la linea con su motivo.
 *
 * Dos limites:
 *  - la ultima linea vigente no se quita (una venta sin vehiculos no significa
 *    nada; para eso esta cancelar la venta);
 *  - el total resultante no puede quedar por debajo de lo ya cobrado.
 *
 * El vehiculo vuelve a `in_inventory` en la misma transaccion.
 */
export class RemoveSaleItemUseCase implements UseCase<RemoveSaleItemInput, SaleWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly sales: SaleRepository,
  ) {}

  async execute(input: RemoveSaleItemInput): Promise<Result<SaleWithDetails, DomainError>> {
    const result = await this.unitOfWork.run<void, DomainError>(async (trx) => {
      const sale = await trx.sales.findById(input.saleId);
      if (sale === null) {
        return err(new SaleNotFoundError(input.saleId));
      }
      if (!isSaleEditable(sale)) {
        return err(new SaleNotEditableError(sale.status));
      }

      const item = sale.items.find((candidate) => candidate.id === input.saleItemId);
      if (item === undefined) {
        const exists = await trx.sales.findItemById(input.saleItemId);
        return err(
          exists === null
            ? new SaleItemNotFoundError(input.saleItemId)
            : new SaleItemDoesNotBelongToSaleError(input.saleItemId, input.saleId),
        );
      }
      if (!isItemActive(item)) {
        return err(new SaleItemAlreadyReturnedError(input.saleItemId));
      }
      if (activeItems(sale.items).length === 1) {
        return err(new LastSaleItemError(input.saleId));
      }

      const newTotal = saleTotal(sale.items.filter((candidate) => candidate.id !== item.id));
      const paid = netPaid(
        await trx.sales.totalPaid(input.saleId),
        await trx.sales.totalRefunded(input.saleId),
      );

      if (newTotal + 0.01 < paid) {
        return err(new PaymentExceedsBalanceError(paid, newTotal));
      }

      await trx.sales.removeItem(input.saleItemId);

      const vehicle = await trx.vehicles.findById(item.vehicleId);
      if (vehicle !== null && vehicle.status === 'sold') {
        await trx.vehicles.updateStatus(item.vehicleId, 'in_inventory');
      }

      return ok(undefined);
    });

    if (!result.ok) {
      return result;
    }

    const updated = await this.sales.findByIdWithDetails(input.saleId);
    if (updated === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return ok(updated);
  }
}
