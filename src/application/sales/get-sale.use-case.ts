import type { SaleWithDetails } from '../../domain/sales/sale.entity';
import { SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UseCase } from '../shared/use-case';

export interface GetSaleInput {
  readonly saleId: string;
}

export class GetSaleUseCase implements UseCase<GetSaleInput, SaleWithDetails> {
  constructor(private readonly sales: SaleRepository) {}

  async execute(input: GetSaleInput): Promise<Result<SaleWithDetails, DomainError>> {
    const sale = await this.sales.findByIdWithDetails(input.saleId);
    if (sale === null) {
      return err(new SaleNotFoundError(input.saleId));
    }
    return ok(sale);
  }
}
