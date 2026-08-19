import { isSaleEditable, type SaleWithDetails } from '../../domain/sales/sale.entity';
import { SaleNotEditableError, SaleNotFoundError } from '../../domain/sales/sale.errors';
import type { SaleRepository } from '../../domain/sales/sale.repository';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import { isSellable } from '../../domain/vehicles/vehicle.entity';
import {
  VehicleAlreadySoldError,
  VehicleNotFoundError,
  VehicleNotSellableError,
} from '../../domain/vehicles/vehicle.errors';
import type { UseCase } from '../shared/use-case';

export interface AddSaleItemInput {
  readonly saleId: string;
  readonly vehicleId: string;
  readonly salePrice: number;
}

/**
 * Agrega un vehiculo a una venta ya abierta.
 *
 * Es el caso del cliente que, con la operacion en marcha, se lleva una unidad
 * mas: en vez de abrir un segundo documento, la venta crece. Solo mientras este
 * `in_process`; una venta completada ya se entrego y una cancelada esta cerrada.
 *
 * Las mismas comprobaciones que en `create-sale` y por el mismo motivo, dentro
 * de la transaccion: el vehiculo tiene que estar disponible y no puede estar en
 * una linea vigente de otra venta.
 */
export class AddSaleItemUseCase implements UseCase<AddSaleItemInput, SaleWithDetails> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly sales: SaleRepository,
  ) {}

  async execute(input: AddSaleItemInput): Promise<Result<SaleWithDetails, DomainError>> {
    const result = await this.unitOfWork.run<void, DomainError>(async (trx) => {
      const sale = await trx.sales.findById(input.saleId);
      if (sale === null) {
        return err(new SaleNotFoundError(input.saleId));
      }
      if (!isSaleEditable(sale)) {
        return err(new SaleNotEditableError(sale.status));
      }

      const vehicle = await trx.vehicles.findById(input.vehicleId);
      if (vehicle === null) {
        return err(new VehicleNotFoundError(input.vehicleId));
      }
      if (!isSellable(vehicle)) {
        return err(new VehicleNotSellableError(input.vehicleId, vehicle.status));
      }
      if (await trx.sales.isVehicleSold(input.vehicleId)) {
        return err(new VehicleAlreadySoldError(input.vehicleId));
      }

      await trx.sales.addItem(input.saleId, {
        vehicleId: input.vehicleId,
        salePrice: input.salePrice,
      });
      await trx.vehicles.updateStatus(input.vehicleId, 'sold');

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
