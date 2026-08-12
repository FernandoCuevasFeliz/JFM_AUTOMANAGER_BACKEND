import { ClientNotFoundError, InactiveClientError } from '../../domain/clients/client.errors';
import type { ClientRepository } from '../../domain/clients/client.repository';
import { isConvertible } from '../../domain/quotations/quotation.entity';
import {
  QuotationNotConvertibleError,
  QuotationNotFoundError,
} from '../../domain/quotations/quotation.errors';
import type { ReservationWithDetails } from '../../domain/reservations/reservation.entity';
import {
  InvalidReservationPeriodError,
  ReservationClientMismatchError,
  ReservationNotFoundError,
  ReservationVehicleMismatchError,
  VehicleAlreadyReservedError,
} from '../../domain/reservations/reservation.errors';
import type { ReservationRepository } from '../../domain/reservations/reservation.repository';
import type { Clock } from '../../domain/shared/clock';
import type { DomainError } from '../../domain/shared/domain-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { UnitOfWork } from '../../domain/shared/unit-of-work';
import { isReservable } from '../../domain/vehicles/vehicle.entity';
import {
  VehicleNotFoundError,
  VehicleNotReservableError,
} from '../../domain/vehicles/vehicle.errors';
import { documentYearPrefix, nextDocumentNumber, yearOf } from '../shared/document-number';
import type { ActorInput, UseCase } from '../shared/use-case';

export interface CreateReservationInput extends ActorInput {
  /** Cotizacion de origen. Opcional: se puede reservar sin cotizar antes. */
  readonly quotationId: string | null;
  readonly clientId: string;
  readonly vehicleId: string;
  readonly depositAmount: number;
  readonly reservationDate: string;
  readonly expirationDate: string;
}

/**
 * Segundo paso del ciclo comercial: el cliente deja un deposito y el vehiculo
 * se aparta.
 *
 * Todo en una transaccion:
 *  1. Se crea la reserva.
 *  2. El vehiculo pasa a `reserved` (deja de estar disponible para otros).
 *  3. Si vino de una cotizacion, esa cotizacion queda `converted`.
 *
 * Si el vehiculo deja de estar disponible entre la validacion y la escritura,
 * la transaccion se revierte completa y no queda una reserva apuntando a un
 * vehiculo que otro vendedor ya aparto.
 */
export class CreateReservationUseCase
  implements UseCase<CreateReservationInput, ReservationWithDetails>
{
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly reservations: ReservationRepository,
    private readonly clients: ClientRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateReservationInput,
  ): Promise<Result<ReservationWithDetails, DomainError>> {
    if (input.expirationDate <= input.reservationDate) {
      return err(new InvalidReservationPeriodError());
    }

    const client = await this.clients.findById(input.clientId);
    if (client === null) {
      return err(new ClientNotFoundError(input.clientId));
    }
    if (!client.isActive) {
      return err(new InactiveClientError(input.clientId));
    }

    const today = this.clock.today();

    const result = await this.unitOfWork.run<string, DomainError>(async (trx) => {
      const vehicle = await trx.vehicles.findById(input.vehicleId);
      if (vehicle === null) {
        return err(new VehicleNotFoundError(input.vehicleId));
      }
      if (!isReservable(vehicle)) {
        return err(new VehicleNotReservableError(input.vehicleId, vehicle.status));
      }

      const activeReservation = await trx.reservations.findActiveByVehicle(input.vehicleId);
      if (activeReservation !== null) {
        return err(new VehicleAlreadyReservedError(input.vehicleId));
      }

      if (input.quotationId !== null) {
        const quotation = await trx.quotations.findById(input.quotationId);
        if (quotation === null) {
          return err(new QuotationNotFoundError(input.quotationId));
        }
        if (quotation.clientId !== input.clientId) {
          return err(new ReservationClientMismatchError());
        }
        if (quotation.vehicleId !== input.vehicleId) {
          return err(new ReservationVehicleMismatchError());
        }
        if (!isConvertible(quotation, today)) {
          return err(new QuotationNotConvertibleError(input.quotationId, quotation.status));
        }
      }

      const year = yearOf(input.reservationDate);
      const lastNumber = await trx.reservations.lastNumberForYear(
        documentYearPrefix('reservation', year),
      );

      const reservation = await trx.reservations.create({
        reservationNumber: nextDocumentNumber('reservation', year, lastNumber),
        quotationId: input.quotationId,
        clientId: input.clientId,
        vehicleId: input.vehicleId,
        depositAmount: input.depositAmount,
        reservationDate: input.reservationDate,
        expirationDate: input.expirationDate,
        status: 'active',
        createdBy: input.actorUserId,
      });

      await trx.vehicles.updateStatus(input.vehicleId, 'reserved');

      if (input.quotationId !== null) {
        await trx.quotations.updateStatus(input.quotationId, 'converted');
      }

      return ok(reservation.id);
    });

    if (!result.ok) {
      return result;
    }

    const created = await this.reservations.findByIdWithDetails(result.value);
    if (created === null) {
      return err(new ReservationNotFoundError(result.value));
    }

    return ok(created);
  }
}
