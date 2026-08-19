import { isSaleEditable, type SaleWithDetails } from '../../domain/sales/sale.entity';
import { SaleNotEditableError, SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { UserNotFoundError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdateSaleInput {
  readonly saleId: string;
  readonly exchangeRate?: number;
  readonly saleDate?: string;
  readonly salespersonId?: string;
}

/**
 * Correccion de la CABECERA de una venta todavia en proceso: tasa, fecha y
 * vendedor.
 *
 * El precio ya no se corrige aqui. Desde que una venta puede llevar varios
 * vehiculos, "el precio de la venta" no existe como dato propio: es la suma de
 * sus lineas. Cambiarlo significa cambiar el precio de una unidad concreta, y
 * para eso esta `update-sale-item` (`PATCH /sales/:id/items/:itemId`), que ademas
 * puede comprobar contra lo ya cobrado con el total recalculado.
 */
export class UpdateSaleUseCase implements UseCase<UpdateSaleInput, SaleWithDetails> {
  constructor(
    private readonly sales: SaleRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(input: UpdateSaleInput): Promise<Result<SaleWithDetails, DomainError>> {
    const sale = await this.sales.findById(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    if (!isSaleEditable(sale)) {
      return err(new SaleNotEditableError(sale.status));
    }

    if (
      input.salespersonId !== undefined &&
      (await this.users.findById(input.salespersonId)) === null
    ) {
      return err(new UserNotFoundError(input.salespersonId));
    }

    await this.sales.update(input.saleId, {
      ...(input.exchangeRate !== undefined ? { exchangeRate: input.exchangeRate } : {}),
      ...(input.saleDate !== undefined ? { saleDate: input.saleDate } : {}),
      ...(input.salespersonId !== undefined ? { salespersonId: input.salespersonId } : {}),
    });

    const updated = await this.sales.findByIdWithDetails(input.saleId);
    if (updated === null) {
      return err(new SaleNotFoundError(input.saleId));
    }

    return ok(updated);
  }
}
