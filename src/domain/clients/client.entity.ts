export type ClientType = 'individual' | 'company';

export interface Client {
  readonly id: string;
  readonly clientType: ClientType;
  readonly documentTypeId: string;
  readonly documentNumber: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly companyName: string | null;
  readonly email: string | null;
  readonly phone: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ClientWithDetails extends Client {
  readonly documentTypeName: string;
}

export interface NewClient {
  readonly clientType: ClientType;
  readonly documentTypeId: string;
  readonly documentNumber: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly companyName: string | null;
  readonly email: string | null;
  readonly phone: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly isActive: boolean;
}

export interface ClientUpdate {
  readonly clientType?: ClientType;
  readonly documentTypeId?: string;
  readonly documentNumber?: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly companyName?: string | null;
  readonly email?: string | null;
  readonly phone?: string;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly isActive?: boolean;
}

/**
 * Identidad del cliente segun su tipo. La base permite que los tres campos de
 * nombre sean NULL porque una sola tabla sirve a personas y empresas; la regla
 * de cual es obligatorio es de negocio y vive aqui.
 *
 * Se resuelve en el dominio y no en Zod a proposito: Zod valida la forma del
 * request, no la coherencia entre `clientType` y los nombres, que ademas debe
 * seguir valiendo en una actualizacion parcial donde el tipo viene del registro
 * ya guardado.
 */
export function hasValidIdentity(client: {
  clientType: ClientType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): boolean {
  if (client.clientType === 'individual') {
    return isFilled(client.firstName) && isFilled(client.lastName);
  }
  return isFilled(client.companyName);
}

export function displayName(client: Client): string {
  if (client.clientType === 'company') {
    return client.companyName ?? client.documentNumber;
  }
  return [client.firstName, client.lastName].filter(isFilled).join(' ') || client.documentNumber;
}

function isFilled(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}
