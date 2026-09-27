/**
 * Catalogo de capacidades reconocidas por la aplicacion.
 *
 * Las asignaciones viven en `role_permissions`; este arreglo limita los valores
 * que un administrador puede guardar para evitar permisos inventados.
 *
 * Convencion: `<recurso>:<accion>`.
 *   - `read`   consultar / listar
 *   - `write`  crear y actualizar
 *   - `delete` borrado logico
 * Acciones especificas del negocio llevan su propio verbo (`vehicles:change-status`).
 */
export const PERMISSIONS = [
  'users:read',
  'users:write',
  'users:delete',

  'catalogs:read',
  'catalogs:write',

  'vehicles:read',
  'vehicles:write',
  'vehicles:delete',
  'vehicles:change-status',

  'clients:read',
  'clients:write',
  'clients:delete',

  'suppliers:read',
  'suppliers:write',
  'suppliers:delete',

  'purchases:read',
  'purchases:write',
  'purchases:delete',

  'expenses:read',
  'expenses:write',
  'expenses:delete',

  'quotations:read',
  'quotations:write',
  'quotations:delete',

  'reservations:read',
  'reservations:write',
  'reservations:delete',

  'sales:read',
  'sales:write',
  'sales:delete',

  'payments:read',
  'payments:write',

  'invoices:read',
  'invoices:write',
  'invoices:issue',
  'credit-notes:write',

  'audit:read',
  'reports:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
