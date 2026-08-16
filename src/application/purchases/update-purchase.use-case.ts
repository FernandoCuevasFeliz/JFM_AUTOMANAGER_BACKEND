import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import {
  CurrencyNotFoundError,
  InconsistentExchangeRateError,
} from '../../domain/catalogs/catalog.errors';
import { isPurchaseEditable, type PurchaseWithDetails } from '../../domain/purchases/purchase.entity';
import {
  PurchaseNotEditableError,
  PurchaseNotFoundError,
} from '../../domain/purchases/purchase.errors';
import type { PurchaseRepository } from '../../domain/purchases/purchase.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent } from '../../domain/shared/money';
import { err, ok, type Result } from '../../domain/shared/result';
import { SupplierNotFoundError } from '../../domain/suppliers/supplier.errors';
import type { SupplierRepository } from '../../domain/suppliers/supplier.repository';
import type { UseCase } from '../shared/use-case';

export interface UpdatePurchaseInput {
  readonly purchaseId: string;
  readonly supplierId?: string;
  readonly currencyId?: string;
  readonly invoiceNumber?: string | null;
  readonly purchaseDate?: string;
  readonly exchangeRate?: number;
  readonly notes?: string | null;
}

/**
 * Edicion del encabezado de una compra. Solo se permite mientras la compra
 * sigue abierta (`pending` o `in_transit`): una compra recibida ya afecto el
 * inventario y su costo, y una cancelada es historia.
 */
export class UpdatePurchaseUseCase implements UseCase<UpdatePurchaseInput, PurchaseWithDetails> {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly suppliers: SupplierRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(input: UpdatePurchaseInput): Promise<Result<PurchaseWithDetails, DomainError>> {
    const purchase = await this.purchases.findById(input.purchaseId);
    if (purchase === null) {
      return err(new PurchaseNotFoundError(input.purchaseId));
    }

    if (!isPurchaseEditable(purchase)) {
      return err(new PurchaseNotEditableError(purchase.status));
    }

    if (
      input.supplierId !== undefined &&
      (await this.suppliers.findById(input.supplierId)) === null
    ) {
      return err(new SupplierNotFoundError(input.supplierId));
    }

    /*
     * La moneda y la tasa se juzgan juntas, y sobre el estado RESULTANTE.
     *
     * Antes solo se comprobaba que la moneda existiera, asi que por PATCH se
     * podia dejar una compra en pesos con tasa 45,5 —lo que el alta rechaza con
     * `InconsistentExchangeRateError`— y bastaba enviar uno solo de los dos
     * campos para descuadrar el par: pasar a DOP sin tocar la tasa, o cambiar
     * la tasa sin tocar la moneda. Se resuelve el par completo mezclando lo que
     * llega con lo que ya habia, y se valida eso.
     */
    const currencyId = input.currencyId ?? purchase.currencyId;
    const exchangeRate = input.exchangeRate ?? purchase.exchangeRate;

    const currency = await this.catalog.findCurrencyById(currencyId);
    if (currency === null) {
      return err(new CurrencyNotFoundError(currencyId));
    }
    if (!isExchangeRateConsistent(currency.code, exchangeRate)) {
      return err(new InconsistentExchangeRateError(currency.code, exchangeRate));
    }

    await this.purchases.update(input.purchaseId, {
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.currencyId !== undefined ? { currencyId: input.currencyId } : {}),
      ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
      ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate } : {}),
      ...(input.exchangeRate !== undefined ? { exchangeRate: input.exchangeRate } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });

    const updated = await this.purchases.findByIdWithDetails(input.purchaseId);
    if (updated === null) {
      return err(new PurchaseNotFoundError(input.purchaseId));
    }

    return ok(updated);
  }
}
