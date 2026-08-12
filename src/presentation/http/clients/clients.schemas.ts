import { z } from 'zod';
import { booleanQuery, nullableString, paginationQuery, requiredString, uuid } from '../shared/common.schemas';

const clientType = z.enum(['individual', 'company']);
const email = z.string().trim().toLowerCase().email('El correo no es valido').max(150);

/**
 * Zod valida forma y obligatoriedad. La coherencia entre `clientType` y los
 * campos de nombre (persona -> nombre y apellido, empresa -> razon social) es
 * una regla de negocio y se verifica en `domain/clients/client.entity.ts`.
 */
export const createClientSchema = z.object({
  clientType: clientType.default('individual'),
  documentTypeId: uuid,
  documentNumber: requiredString(30, 'El numero de documento'),
  firstName: nullableString(100),
  lastName: nullableString(100),
  companyName: nullableString(150),
  email: email.nullable().optional().default(null),
  phone: requiredString(30, 'El telefono'),
  address: nullableString(255),
  city: nullableString(100),
  isActive: z.boolean().default(true),
});

export const updateClientSchema = z
  .object({
    clientType: clientType.optional(),
    documentTypeId: uuid.optional(),
    documentNumber: requiredString(30, 'El numero de documento').optional(),
    firstName: nullableString(100),
    lastName: nullableString(100),
    companyName: nullableString(150),
    email: email.nullable().optional(),
    phone: requiredString(30, 'El telefono').optional(),
    address: nullableString(255),
    city: nullableString(100),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const listClientsQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  clientType: clientType.optional(),
  city: z.string().trim().optional(),
  isActive: booleanQuery,
});

export type CreateClientBody = z.infer<typeof createClientSchema>;
export type UpdateClientBody = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
