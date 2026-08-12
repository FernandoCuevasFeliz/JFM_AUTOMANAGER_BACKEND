import { z } from 'zod';
import { booleanQuery, nullableString, paginationQuery, requiredString, uuid } from '../shared/common.schemas';

/**
 * Politica de contrasenas: minimo 8 caracteres con al menos una letra y un
 * numero. Es una regla de forma (la valida Zod), no una invariante de negocio.
 */
const password = z
  .string()
  .min(8, 'La contrasena debe tener al menos 8 caracteres')
  .max(72, 'La contrasena no puede superar los 72 caracteres')
  .regex(/[A-Za-z]/, 'La contrasena debe incluir al menos una letra')
  .regex(/\d/, 'La contrasena debe incluir al menos un numero');

const email = z.string().trim().toLowerCase().email('El correo no es valido').max(150);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'La contrasena es obligatoria'),
});

export const createUserSchema = z.object({
  roleId: uuid,
  firstName: requiredString(100, 'El nombre'),
  lastName: requiredString(100, 'El apellido'),
  email,
  password,
  phone: nullableString(30),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z
  .object({
    roleId: uuid.optional(),
    firstName: requiredString(100, 'El nombre').optional(),
    lastName: requiredString(100, 'El apellido').optional(),
    email: email.optional(),
    phone: nullableString(30),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contrasena actual es obligatoria'),
  newPassword: password,
});

export const resetPasswordSchema = z.object({
  newPassword: password,
});

export const listUsersQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  roleId: uuid.optional(),
  isActive: booleanQuery,
});

export type LoginBody = z.infer<typeof loginSchema>;
export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
