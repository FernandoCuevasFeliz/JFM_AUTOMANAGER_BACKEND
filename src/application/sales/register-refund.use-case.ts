import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import {
  CurrencyNotFoundError,
  InconsistentExchangeRateError,
  PaymentMethodNotFoundError,
} from '../../domain/catalogs/catalog.errors';
import { netPaid, type Refund } from '../../domain/sales/sale.entity';
import {
  RefundCurrencyMismatchError,
  RefundExceedsPaidError,
  SaleItemDoesNotBelongToSaleError,
  SaleItemNotFoundError,
  SaleNotFoundError,
} from '../../domain/sales/sale.errors';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent } from '../../domain/shared/money';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface RegisterRefundInput extends ActorInput {
  readonly saleId: string;
  /** `null` = reembolso general de la venta, no atado a una unidad devuelta. */
  readonly saleItemId: string | null;
  readonly refundMethodId: string;
  readonly currencyId: string;
  readonly amount: number;
  readonly exchangeRate: number;
  readonly refundDate: string;
  readonly reason: string;
}

export interface RegisterRefundOutput {
  readonly refund: Refund;
  readonly totalPaid: number;
  readonly totalRefunded: number;
  readonly netPaid: number;
}

/**
 * Devolucion de dinero al cliente.
 *
 * Vive en su propia tabla y no como un abono negativo en `sale_payments`:
 * aquella responde "cuanto entro" y su `CHECK (amount > 0)` lo garantiza. Un
 * reembolso lleva ademas su propia tasa —la del dia en que sale el dinero, no la
 * de la venta— por el mismo criterio de costo historico que rige compras y
 * gastos.
 *
 * El limite es lo COBRADO neto de reembolsos anteriores, no el precio de la
 * venta: no se puede devolver dinero que el cliente nunca entrego. El calculo y
 * la insercion van en la misma transaccion para que dos cajeros no puedan
 * pasarse registrando a la vez.
 *
 * No exige que el vehiculo este devuelto. Un reembolso puede ser un ajuste de
 * precio pactado o la parte proporcional de un desistimiento, y ahi `saleItemId`
 * va en `null`.
 */
export class RegisterRefundUseCase implements UseCase<RegisterRefundInput, RegisterRefundOutput> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(input: RegisterRefundInput): Promise<Result<RegisterRefundOutput, DomainError>> {
    if ((await this.catalog.findPaymentMethodById(input.refundMethodId)) === null) {
      return err(new PaymentMethodNotFoundError(input.refundMethodId));
    }

    const currency = await this.catalog.findCurrencyById(input.currencyId);
    if (currency === null) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }
    if (!isExchangeRateConsistent(currency.code, input.exchangeRate)) {
      return err(new InconsistentExchangeRateError(currency.code, input.exchangeRate));
    }

    return this.unitOfWork.run<RegisterRefundOutput, DomainError>(async (trx) => {
      const sale = await trx.sales.findById(input.saleId);
      if (sale === null) {
        return err(new SaleNotFoundError(input.saleId));
      }

      // Misma razon que en los cobros: si el reembolso llegara en otra moneda,
      // el neto cobrado sumaria importes incomparables y el saldo saldria mal.
      if (input.currencyId !== sale.currencyId) {
        const saleCurrency = await this.catalog.findCurrencyById(sale.currencyId);
        return err(new RefundCurrencyMismatchError(saleCurrency?.code ?? sale.currencyId));
      }

      if (input.saleItemId !== null) {
        const item = sale.items.find((candidate) => candidate.id === input.saleItemId);
        if (item === undefined) {
          const exists = await trx.sales.findItemById(input.saleItemId);
          return err(
            exists === null
              ? new SaleItemNotFoundError(input.saleItemId)
              : new SaleItemDoesNotBelongToSaleError(input.saleItemId, input.saleId),
          );
        }
      }

      const paid = await trx.sales.totalPaid(input.saleId);
      const alreadyRefunded = await trx.sales.totalRefunded(input.saleId);
      const available = netPaid(paid, alreadyRefunded);

      if (input.amount > available + 0.01) {
        return err(new RefundExceedsPaidError(input.amount, Math.max(available, 0)));
      }

      const refund = await trx.sales.addRefund({
        saleId: input.saleId,
        saleItemId: input.saleItemId,
        refundMethodId: input.refundMethodId,
        currencyId: input.currencyId,
        amount: input.amount,
        exchangeRate: input.exchangeRate,
        refundDate: input.refundDate,
        reason: input.reason.trim(),
        processedBy: input.actorUserId,
      });

      const totalRefunded = await trx.sales.totalRefunded(input.saleId);

      return ok({
        refund,
        totalPaid: paid,
        totalRefunded,
        netPaid: netPaid(paid, totalRefunded),
      });
    });
  }
}
