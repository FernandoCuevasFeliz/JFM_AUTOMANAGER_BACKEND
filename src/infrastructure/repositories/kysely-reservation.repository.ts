import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type {
  NewReservation,
  Reservation,
  ReservationStatus,
  ReservationUpdate,
  ReservationWithDetails,
} from '../../domain/reservations/reservation.entity';
import type {
  ReservationFilters,
  ReservationRepository,
} from '../../domain/reservations/reservation.repository';
import {
  buildPaginatedResult,
  type PageQuery,
  type PaginatedResult,
  toOffset,
} from '../../domain/shared/pagination';
import type { Executor } from '../database/connection';
import type { ReservationsTable } from '../database/database.types';
import { isEmptyPatch, likePattern, toDate, toNullableDate, toNumber } from './mappers';

const CLIENT_NAME = sql<string>`coalesce(clients.company_name, clients.first_name || ' ' || clients.last_name)`;
const USER_NAME = sql<string>`users.first_name || ' ' || users.last_name`;

function mapReservation(row: Selectable<ReservationsTable>): Reservation {
  return {
    id: row.id,
    reservationNumber: row.reservation_number,
    quotationId: row.quotation_id,
    clientId: row.client_id,
    vehicleId: row.vehicle_id,
    depositAmount: toNumber(row.deposit_amount),
    reservationDate: row.reservation_date,
    expirationDate: row.expiration_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deletedAt: toNullableDate(row.deleted_at),
  };
}

type ReservationDetailRow = Selectable<ReservationsTable> & {
  client_name: string;
  chassis_number: string;
  brand_name: string;
  model_name: string;
  vehicle_year: number;
  quotation_number: string | null;
  created_by_name: string;
};

function mapReservationDetail(row: ReservationDetailRow): ReservationWithDetails {
  return {
    ...mapReservation(row),
    clientName: row.client_name,
    vehicleChassisNumber: row.chassis_number,
    vehicleBrandName: row.brand_name,
    vehicleModelName: row.model_name,
    vehicleYear: row.vehicle_year,
    quotationNumber: row.quotation_number,
    createdByName: row.created_by_name,
  };
}

export class KyselyReservationRepository implements ReservationRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: string): Promise<Reservation | null> {
    const row = await this.db
      .selectFrom('reservations')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapReservation(row);
  }

  async findByIdWithDetails(id: string): Promise<ReservationWithDetails | null> {
    const row = await this.detailQuery()
      .where('reservations.id', '=', id)
      .where('reservations.deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapReservationDetail(row);
  }

  async existsByNumber(reservationNumber: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('reservations')
      .select('id')
      .where('reservation_number', '=', reservationNumber)
      .executeTakeFirst();

    return row !== undefined;
  }

  async findActiveByVehicle(vehicleId: string): Promise<Reservation | null> {
    const row = await this.db
      .selectFrom('reservations')
      .selectAll()
      .where('vehicle_id', '=', vehicleId)
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return row === undefined ? null : mapReservation(row);
  }

  async list(
    filters: ReservationFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ReservationWithDetails>> {
    let base = this.baseJoin().where('reservations.deleted_at', 'is', null);

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const pattern = likePattern(filters.search);
      base = base.where((eb) =>
        eb.or([
          eb('reservations.reservation_number', 'ilike', pattern),
          eb('vehicles.chassis_number', 'ilike', pattern),
          eb('clients.company_name', 'ilike', pattern),
          eb('clients.first_name', 'ilike', pattern),
          eb('clients.last_name', 'ilike', pattern),
        ]),
      );
    }

    if (filters.clientId !== undefined) {
      base = base.where('reservations.client_id', '=', filters.clientId);
    }
    if (filters.vehicleId !== undefined) {
      base = base.where('reservations.vehicle_id', '=', filters.vehicleId);
    }
    if (filters.status !== undefined) {
      base = base.where('reservations.status', '=', filters.status);
    }
    if (filters.dateFrom !== undefined) {
      base = base.where('reservations.reservation_date', '>=', filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      base = base.where('reservations.reservation_date', '<=', filters.dateTo);
    }

    const totalRow = await base
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('reservations')
      .select(this.detailColumns())
      .orderBy('reservations.reservation_date', 'desc')
      .orderBy('reservations.created_at', 'desc')
      .limit(page.pageSize)
      .offset(toOffset(page))
      .execute();

    return buildPaginatedResult(rows.map(mapReservationDetail), Number(totalRow.total), page);
  }

  async create(data: NewReservation): Promise<Reservation> {
    const row = await this.db
      .insertInto('reservations')
      .values({
        reservation_number: data.reservationNumber,
        quotation_id: data.quotationId,
        client_id: data.clientId,
        vehicle_id: data.vehicleId,
        deposit_amount: data.depositAmount,
        reservation_date: data.reservationDate,
        expiration_date: data.expirationDate,
        status: data.status,
        created_by: data.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapReservation(row);
  }

  async update(id: string, data: ReservationUpdate): Promise<Reservation | null> {
    const patch = {
      ...(data.depositAmount !== undefined ? { deposit_amount: data.depositAmount } : {}),
      ...(data.expirationDate !== undefined ? { expiration_date: data.expirationDate } : {}),
    };

    if (isEmptyPatch(patch)) {
      return this.findById(id);
    }

    const row = await this.db
      .updateTable('reservations')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapReservation(row);
  }

  async updateStatus(id: string, status: ReservationStatus): Promise<Reservation | null> {
    const row = await this.db
      .updateTable('reservations')
      .set({ status })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapReservation(row);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db
      .updateTable('reservations')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  async expireOverdue(today: string): Promise<{ reservationId: string; vehicleId: string }[]> {
    const rows = await this.db
      .updateTable('reservations')
      .set({ status: 'expired' })
      .where('expiration_date', '<', today)
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .returning(['id', 'vehicle_id'])
      .execute();

    return rows.map((row) => ({ reservationId: row.id, vehicleId: row.vehicle_id }));
  }

  async lastNumberForYear(yearPrefix: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('reservations')
      .select('reservation_number')
      .where('reservation_number', 'like', `${yearPrefix}%`)
      .orderBy('reservation_number', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row === undefined ? null : row.reservation_number;
  }

  private baseJoin() {
    return this.db
      .selectFrom('reservations')
      .innerJoin('clients', 'clients.id', 'reservations.client_id')
      .innerJoin('vehicles', 'vehicles.id', 'reservations.vehicle_id')
      .innerJoin('vehicle_brands', 'vehicle_brands.id', 'vehicles.brand_id')
      .innerJoin('vehicle_models', 'vehicle_models.id', 'vehicles.model_id')
      .innerJoin('users', 'users.id', 'reservations.created_by')
      .leftJoin('quotations', 'quotations.id', 'reservations.quotation_id');
  }

  private detailColumns() {
    return [
      CLIENT_NAME.as('client_name'),
      sql<string>`vehicles.chassis_number`.as('chassis_number'),
      sql<string>`vehicle_brands.name`.as('brand_name'),
      sql<string>`vehicle_models.name`.as('model_name'),
      sql<number>`vehicles.year`.as('vehicle_year'),
      sql<string | null>`quotations.quotation_number`.as('quotation_number'),
      USER_NAME.as('created_by_name'),
    ] as const;
  }

  private detailQuery() {
    return this.baseJoin().selectAll('reservations').select(this.detailColumns());
  }
}
