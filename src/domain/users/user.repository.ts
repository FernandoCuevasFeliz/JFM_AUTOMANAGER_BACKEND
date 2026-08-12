import type { PageQuery, PaginatedResult } from '../shared/pagination';
import type { NewUser, User, UserUpdate, UserWithRole } from './user.entity';

export interface UserFilters {
  /** Busqueda libre sobre nombre, apellido y correo. */
  readonly search?: string;
  readonly roleId?: string;
  readonly isActive?: boolean;
}

/**
 * Puerto de persistencia de usuarios.
 *
 * Todas las lecturas excluyen registros con `deleted_at` no nulo; el filtro de
 * borrado logico es responsabilidad de la implementacion, no del caso de uso.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByIdWithRole(id: string): Promise<UserWithRole | null>;
  findByEmail(email: string): Promise<UserWithRole | null>;
  existsByEmail(email: string, excludeUserId?: string): Promise<boolean>;
  list(filters: UserFilters, page: PageQuery): Promise<PaginatedResult<UserWithRole>>;
  create(data: NewUser): Promise<User>;
  update(id: string, data: UserUpdate): Promise<User | null>;
  softDelete(id: string): Promise<boolean>;
  touchLastLogin(id: string, at: Date): Promise<void>;
}
