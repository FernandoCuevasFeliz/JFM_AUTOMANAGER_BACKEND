import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import { CurrencyNotFoundError, PaymentMethodNotFoundError } from '../../domain/catalogs/catalog.errors';
import { acceptsPayments, pendingBalance, type SalePayment } from '../../domain/sales/sale.entity';
import {
  PaymentCurrencyMismatchError,
  PaymentExceedsBalanceError,
  SaleDoesNotAcceptPaymentsError,
  SaleNotFoundError,
} from '../../domain/sales/sale.errors';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface RegisterSalePaymentInput extends ActorInput {
  readonly saleId: string;
  readonly paymentMethodId: string;
  readonly currencyId: string;
  readonly amount: number;
  readonly paymentDate: string;
  readonly referenceNumber: string | null;
}

export interface RegisterSalePaymentOutput {
  readonly payment: SalePayment;
  readonly totalPaid: number;
  readonly pendingBalance: number;
  readonly fullyPaid: boolean;
}

/**
 * Abono a una venta.
 *
 * La suma de los pagos no puede superar el precio de venta: aceptar mas
 * dejaria un saldo negativo que no significa nada en la contabilidad de la
 * empresa. El calculo del saldo y la insercion van en la misma transaccion
 * para que dos cajeros no puedan sobrepasar el total registrando a la vez.
 *
 * Cuando el saldo llega a cero la venta NO se completa sola: quedar saldada y
 * entregar la unidad son dos momentos distintos del negocio. El resultado
 * incluye `fullyPaid` para que el frontend ofrezca completar la venta.
 */
export class RegisterSalePaymentUseCase
  implements UseCase<RegisterSalePaymentInput, RegisterSalePaymentOutput>
{
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(
    input: RegisterSalePaymentInput,
  ): Promise<Result<RegisterSalePaymentOutput, DomainError>> {
    if ((await this.catalog.findPaymentMethodById(input.paymentMethodId)) === null) {
      return err(new PaymentMethodNotFoundError(input.paymentMethodId));
    }

    const currency = await this.catalog.findCurrencyById(input.currencyId);
    if (currency === null) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }

    return this.unitOfWork.run<RegisterSalePaymentOutput, DomainError>(async (trx) => {
      const sale = await trx.sales.findById(input.saleId);
      if (sale === null) {
        return err(new SaleNotFoundError(input.saleId));
      }

      if (!acceptsPayments(sale)) {
        return err(new SaleDoesNotAcceptPaymentsError(sale.status));
      }

      // Sin esta comprobacion, `totalPaid` sumaria importes de monedas
      // distintas y el saldo pendiente quedaria mal calculado.
      if (input.currencyId !== sale.currencyId) {
        const saleCurrency = await this.catalog.findCurrencyById(sale.currencyId);
        return err(new PaymentCurrencyMismatchError(saleCurrency?.code ?? sale.currencyId));
      }

      const alreadyPaid = await trx.sales.totalPaid(input.saleId);
      const balance = pendingBalance(sale.salePrice, alreadyPaid);

      if (input.amount > balance + 0.01) {
        return err(new PaymentExceedsBalanceError(input.amount, balance));
      }

      const payment = await trx.sales.addPayment({
        saleId: input.saleId,
        paymentMethodId: input.paymentMethodId,
        currencyId: input.currencyId,
        amount: input.amount,
        paymentDate: input.paymentDate,
        referenceNumber: input.referenceNumber,
        receivedBy: input.actorUserId,
      });

      const totalPaid = await trx.sales.totalPaid(input.saleId);
      const remaining = pendingBalance(sale.salePrice, totalPaid);

      return ok({
        payment,
        totalPaid,
        pendingBalance: remaining,
        fullyPaid: remaining <= 0.01,
      });
    });
  }
}
