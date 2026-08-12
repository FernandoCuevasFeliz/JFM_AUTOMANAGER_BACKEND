import type { CatalogRepository } from '../../domain/catalogs/catalog.entity';
import {
  CurrencyNotFoundError,
  InconsistentExchangeRateError,
} from '../../domain/catalogs/catalog.errors';
import type {
  NewPurchaseItem,
  PurchaseStatus,
  PurchaseWithDetails,
} from '../../domain/purchases/purchase.entity';
import {
  DuplicateVehicleInPurchaseError,
  PurchaseNotFoundError,
  PurchaseNumberAlreadyExistsError,
  PurchaseWithoutItemsError,
} from '../../domain/purchases/purchase.errors';
import type { PurchaseRepository } from '../../domain/purchases/purchase.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { isExchangeRateConsistent } from '../../domain/shared/money';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import { InactiveSupplierError, SupplierNotFoundError } from '../../domain/suppliers/supplier.errors';
import type { SupplierRepository } from '../../domain/suppliers/supplier.repository';
import {
  VehicleAlreadyPurchasedError,
  VehicleNotFoundError,
} from '../../domain/vehicles/vehicle.errors';
import { nextDocumentNumber, yearOf } from '../shared/document-number';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreatePurchaseInput extends ActorInput {
  readonly supplierId: string;
  readonly currencyId: string;
  /** Si no se envia, el sistema genera el correlativo `COM-ANO-NNNNNN`. */
  readonly purchaseNumber?: string;
  readonly invoiceNumber: string | null;
  readonly purchaseDate: string;
  readonly exchangeRate: number;
  readonly status: PurchaseStatus;
  readonly notes: string | null;
  readonly items: readonly NewPurchaseItem[];
}

/**
 * Registro de una compra/importacion con sus vehiculos.
 *
 * Todo ocurre en una transaccion: encabezado, items y, si la compra se
 * registra ya como recibida, el paso de los vehiculos a inventario. Si un solo
 * item falla (vehiculo inexistente o ya comprado) no queda ningun encabezado
 * huerfano.
 *
 * `purchase_items.vehicle_id` es UNIQUE en la base. Se comprueba antes de
 * insertar para devolver un 409 explicando la regla ("un vehiculo se compra una
 * sola vez") en lugar de dejar escapar el error de constraint como un 500.
 */
export class CreatePurchaseUseCase implements UseCase<CreatePurchaseInput, PurchaseWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly purchases: PurchaseRepository,
    private readonly suppliers: SupplierRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(input: CreatePurchaseInput): Promise<Result<PurchaseWithDetails, DomainError>> {
    if (input.items.length === 0) {
      return err(new PurchaseWithoutItemsError());
    }

    const duplicated = findDuplicateVehicleId(input.items);
    if (duplicated !== null) {
      return err(new DuplicateVehicleInPurchaseError(duplicated));
    }

    const supplier = await this.suppliers.findById(input.supplierId);
    if (supplier === null) {
      return err(new SupplierNotFoundError(input.supplierId));
    }
    if (!supplier.isActive) {
      return err(new InactiveSupplierError(input.supplierId));
    }

    const currency = await this.catalog.findCurrencyById(input.currencyId);
    if (currency === null) {
      return err(new CurrencyNotFoundError(input.currencyId));
    }
    if (!isExchangeRateConsistent(currency.code, input.exchangeRate)) {
      return err(new InconsistentExchangeRateError(currency.code, input.exchangeRate));
    }

    if (
      input.purchaseNumber !== undefined &&
      (await this.purchases.existsByPurchaseNumber(input.purchaseNumber))
    ) {
      return err(new PurchaseNumberAlreadyExistsError(input.purchaseNumber));
    }

    const result = await this.unitOfWork.run<string, DomainError>(async (trx) => {
      for (const item of input.items) {
        const vehicle = await trx.vehicles.findById(item.vehicleId);
        if (vehicle === null) {
          return err(new VehicleNotFoundError(item.vehicleId));
        }
        if (await trx.purchases.isVehiclePurchased(item.vehicleId)) {
          return err(new VehicleAlreadyPurchasedError(item.vehicleId));
        }
      }

      const purchaseNumber =
        input.purchaseNumber ??
        nextDocumentNumber(
          'purchase',
          yearOf(input.purchaseDate),
          await trx.purchases.lastNumberForYear(
            `COM-${yearOf(input.purchaseDate)}-`,
          ),
        );

      const purchase = await trx.purchases.create({
        supplierId: input.supplierId,
        currencyId: input.currencyId,
        purchaseNumber,
        invoiceNumber: input.invoiceNumber,
        purchaseDate: input.purchaseDate,
        exchangeRate: input.exchangeRate,
        status: input.status,
        createdBy: input.actorUserId,
        notes: input.notes,
      });

      for (const item of input.items) {
        await trx.purchases.addItem(purchase.id, item);
      }

      // Una compra registrada directamente como recibida ingresa la mercancia
      // a inventario en el mismo acto.
      if (input.status === 'received') {
        for (const item of input.items) {
          const vehicle = await trx.vehicles.findById(item.vehicleId);
          if (vehicle !== null && vehicle.status === 'in_transit') {
            await trx.vehicles.updateStatus(item.vehicleId, 'in_inventory');
          }
        }
      }

      return ok(purchase.id);
    });

    if (!result.ok) {
      return result;
    }

    const created = await this.purchases.findByIdWithDetails(result.value);
    if (created === null) {
      return err(new PurchaseNotFoundError(result.value));
    }

    return ok(created);
  }
}

function findDuplicateVehicleId(items: readonly NewPurchaseItem[]): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.vehicleId)) {
      return item.vehicleId;
    }
    seen.add(item.vehicleId);
  }
  return null;
}
