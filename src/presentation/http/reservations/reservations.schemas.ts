import { z } from 'zod';
import { dateOnly, money, paginationQuery, uuid } from '../shared/common.schemas';

const reservationStatus = z.enum(['active', 'expired', 'converted', 'cancelled']);

export const createReservationSchema = z.object({
  /** Cotizacion de origen; `null` si se reserva sin cotizar antes. */
  quotationId: uuid.nullable().optional().default(null),
  clientId: uuid,
  vehicleId: uuid,
  depositAmount: money,
  reservationDate: dateOnly,
  expirationDate: dateOnly,
});

export const updateReservationSchema = z
  .object({
    depositAmount: money.optional(),
    expirationDate: dateOnly.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const listReservationsQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  clientId: uuid.optional(),
  vehicleId: uuid.optional(),
  status: reservationStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type CreateReservationBody = z.infer<typeof createReservationSchema>;
export type UpdateReservationBody = z.infer<typeof updateReservationSchema>;
export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;
