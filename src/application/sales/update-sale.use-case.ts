import { isSaleEditable, type SaleWithDetails } from '../../domain/sales/sale.entity';
import {
  PaymentExceedsBalanceError,
  SaleNotEditableError,
  SaleNotFoundError,
} from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { UserNotFoundError } from '../../domain/users/user.errors';
import type { UserRepository } from '../../domain/users/user.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdateSaleInput {
  readonly saleId: string;
  readonly salePrice?: number;
  readonly exchangeRate?: number;
  readonly saleDate?: string;
  readonly salespersonId?: string;
}

/**
 * Correccion de una venta todavia en proceso. No se puede bajar el precio por
 * debajo de lo ya cobrado: eso dejaria un saldo negativo.
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

    if (input.salePrice !== undefined) {
      const paid = await this.sales.totalPaid(input.saleId);
      if (input.salePrice + 0.01 < paid) {
        return err(new PaymentExceedsBalanceError(paid, input.salePrice));
      }
    }

    if (
      input.salespersonId !== undefined &&
      (await this.users.findById(input.salespersonId)) === null
    ) {
      return err(new UserNotFoundError(input.salespersonId));
    }

    await this.sales.update(input.saleId, {
      ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
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
