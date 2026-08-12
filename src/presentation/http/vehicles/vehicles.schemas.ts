import { z } from 'zod';
import { VEHICLE_STATUSES } from '../../../domain/vehicles/vehicle.entity';
import {
  booleanQuery,
  money,
  nullableString,
  paginationQuery,
  requiredString,
  uuid,
} from '../shared/common.schemas';

const vehicleStatus = z.enum(
  VEHICLE_STATUSES as unknown as [string, ...string[]],
) as z.ZodType<(typeof VEHICLE_STATUSES)[number]>;

/** VIN: 17 caracteres en el estandar actual, pero la base admite hasta 30. */
const chassisNumber = z
  .string()
  .trim()
  .toUpperCase()
  .min(5, 'El numero de chasis es demasiado corto')
  .max(30, 'El numero de chasis no puede superar los 30 caracteres');

const year = z
  .number()
  .int('El ano debe ser un numero entero')
  .min(1900, 'El ano no puede ser anterior a 1900')
  .max(2100, 'El ano no puede ser posterior a 2100');

export const createVehicleSchema = z.object({
  brandId: uuid,
  modelId: uuid,
  year,
  chassisNumber,
  color: nullableString(40),
  mileage: z.number().int().nonnegative('El kilometraje no puede ser negativo').nullable().optional().default(null),
  engineNumber: nullableString(50),
  transmissionType: nullableString(20),
  fuelType: nullableString(20),
  salePrice: money.nullable().optional().default(null),
  // Sin `reserved` ni `sold`: esos estados los produce el ciclo comercial.
  status: z.enum(['in_transit', 'in_inventory', 'in_repair', 'unavailable']).default('in_transit'),
  notes: nullableString(5000),
  isActive: z.boolean().default(true),
});

export const updateVehicleSchema = z
  .object({
    brandId: uuid.optional(),
    modelId: uuid.optional(),
    year: year.optional(),
    chassisNumber: chassisNumber.optional(),
    color: nullableString(40),
    mileage: z.number().int().nonnegative().nullable().optional(),
    engineNumber: nullableString(50),
    transmissionType: nullableString(20),
    fuelType: nullableString(20),
    salePrice: money.nullable().optional(),
    notes: nullableString(5000),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const changeVehicleStatusSchema = z.object({
  status: z.enum(['in_transit', 'in_inventory', 'in_repair', 'unavailable']),
});

export const listVehiclesQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  status: z
    .union([vehicleStatus, z.array(vehicleStatus)])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    ),
  brandId: uuid.optional(),
  modelId: uuid.optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  priceFrom: z.coerce.number().nonnegative().optional(),
  priceTo: z.coerce.number().nonnegative().optional(),
  isActive: booleanQuery,
});

export const addVehicleImageSchema = z.object({
  url: requiredString(500, 'La URL de la imagen'),
  isPrimary: z.boolean().default(false),
});

export const createBrandSchema = z.object({ name: requiredString(80, 'El nombre de la marca') });

export const updateBrandSchema = z
  .object({
    name: requiredString(80, 'El nombre de la marca').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const createModelSchema = z.object({
  brandId: uuid,
  name: requiredString(80, 'El nombre del modelo'),
});

export const updateModelSchema = z
  .object({
    name: requiredString(80, 'El nombre del modelo').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const catalogQuerySchema = z.object({
  brandId: uuid.optional(),
  includeInactive: booleanQuery,
});

export const imageParamsSchema = z.object({ id: uuid, imageId: uuid });

export type CreateVehicleBody = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleBody = z.infer<typeof updateVehicleSchema>;
export type ChangeVehicleStatusBody = z.infer<typeof changeVehicleStatusSchema>;
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;
export type AddVehicleImageBody = z.infer<typeof addVehicleImageSchema>;
export type CreateBrandBody = z.infer<typeof createBrandSchema>;
export type UpdateBrandBody = z.infer<typeof updateBrandSchema>;
export type CreateModelBody = z.infer<typeof createModelSchema>;
export type UpdateModelBody = z.infer<typeof updateModelSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
