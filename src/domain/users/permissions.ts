/**
 * RBAC en codigo de aplicacion.
 *
 * Por decision de diseno la base de datos NO modela permisos: `roles` es un
 * catalogo simple y `users.role_id` apunta a el. El mapa de permisos vive
 * aqui, versionado junto al codigo, porque cambia con cada despliegue de
 * funcionalidad y no con datos operativos.
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

  'audit:read',
  'reports:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Nombres de rol sembrados por la migracion 002. */
export const ROLE_ADMIN = 'admin';
export const ROLE_VENTAS = 'ventas';
export const ROLE_INVENTARIO = 'inventario';
export const ROLE_CONTABILIDAD = 'contabilidad';

/**
 * Un rol que no aparezca en este mapa no tiene ningun permiso. Es intencional:
 * crear un rol nuevo en la tabla `roles` no otorga acceso hasta que se declare
 * aqui explicitamente (fail-closed).
 */
export const ROLE_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  [ROLE_ADMIN]: PERMISSIONS,

  [ROLE_VENTAS]: [
    'catalogs:read',
    'vehicles:read',
    'clients:read',
    'clients:write',
    'quotations:read',
    'quotations:write',
    'quotations:delete',
    'reservations:read',
    'reservations:write',
    'reservations:delete',
    'sales:read',
    'sales:write',
    'payments:read',
    'payments:write',
    'reports:read',
  ],

  [ROLE_INVENTARIO]: [
    'catalogs:read',
    'catalogs:write',
    'vehicles:read',
    'vehicles:write',
    'vehicles:delete',
    'vehicles:change-status',
    'suppliers:read',
    'suppliers:write',
    'suppliers:delete',
    'purchases:read',
    'purchases:write',
    'purchases:delete',
    'clients:read',
    'expenses:read',
    'reports:read',
  ],

  [ROLE_CONTABILIDAD]: [
    'catalogs:read',
    'vehicles:read',
    'clients:read',
    'suppliers:read',
    'purchases:read',
    'expenses:read',
    'expenses:write',
    'expenses:delete',
    'quotations:read',
    'reservations:read',
    'sales:read',
    'payments:read',
    'payments:write',
    'reports:read',
  ],
};

export function permissionsForRole(roleName: string): readonly Permission[] {
  return ROLE_PERMISSIONS[roleName] ?? [];
}

export function roleHasPermission(roleName: string, permission: Permission): boolean {
  return permissionsForRole(roleName).includes(permission);
}

export function roleHasAnyPermission(roleName: string, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => roleHasPermission(roleName, permission));
}
