import { z } from 'zod';
import { booleanQuery, nullableString, paginationQuery, requiredString } from '../shared/common.schemas';

const email = z.string().trim().toLowerCase().email('El correo no es valido').max(150);

export const createSupplierSchema = z.object({
  name: requiredString(150, 'El nombre del proveedor'),
  contactName: nullableString(100),
  documentNumber: nullableString(30),
  email: email.nullable().optional().default(null),
  phone: nullableString(30),
  address: nullableString(255),
  country: nullableString(80),
  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = z
  .object({
    name: requiredString(150, 'El nombre del proveedor').optional(),
    contactName: nullableString(100),
    documentNumber: nullableString(30),
    email: email.nullable().optional(),
    phone: nullableString(30),
    address: nullableString(255),
    country: nullableString(80),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const listSuppliersQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  country: z.string().trim().optional(),
  isActive: booleanQuery,
});

export type CreateSupplierBody = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
