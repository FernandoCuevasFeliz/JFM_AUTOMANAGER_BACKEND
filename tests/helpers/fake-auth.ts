import type { Clock } from '../../src/domain/shared/clock';
import type { PageQuery, PaginatedResult } from '../../src/domain/shared/pagination';
import type {
  ActiveSession,
  NewRefreshToken,
  RefreshToken,
  RefreshTokenGenerator,
} from '../../src/domain/users/refresh-token.entity';
import type { RefreshTokenRepository } from '../../src/domain/users/refresh-token.repository';
import type {
  AuthTokenPayload,
  IssuedToken,
  TokenService,
} from '../../src/domain/users/token-service';
import type {
  NewUser,
  User,
  UserUpdate,
  UserWithRole,
} from '../../src/domain/users/user.entity';
import type { UserFilters, UserRepository } from '../../src/domain/users/user.repository';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  today(): string {
    return this.current.toISOString().slice(0, 10);
  }

  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 24 * 60 * 60 * 1000);
  }
}

/** Hash trivial pero determinista: basta para probar la logica de rotacion. */
export class FakeRefreshTokenGenerator implements RefreshTokenGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `token-${this.counter}`;
  }

  hash(token: string): string {
    return `hash(${token})`;
  }
}

export class FakeTokenService implements TokenService {
  issue(payload: AuthTokenPayload): IssuedToken {
    return {
      token: `jwt-for-${payload.userId}`,
      expiresAt: new Date('2026-03-01T20:00:00Z'),
    };
  }

  verify(): AuthTokenPayload | null {
    return null;
  }
}

export class FakeRefreshTokenRepository implements RefreshTokenRepository {
  readonly tokens = new Map<string, RefreshToken>();
  private sequence = 0;

  constructor(private readonly clock: Clock) {}

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    this.sequence += 1;
    const token: RefreshToken = {
      id: `rt-${this.sequence}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    };
    this.tokens.set(token.id, token);
    return token;
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return [...this.tokens.values()].find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async revoke(id: string): Promise<boolean> {
    const token = this.tokens.get(id);
    if (token === undefined || token.revokedAt !== null) {
      return false;
    }
    this.tokens.set(id, { ...token, revokedAt: this.clock.now() });
    return true;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    let revoked = 0;
    for (const [id, token] of this.tokens) {
      if (token.userId === userId && token.revokedAt === null) {
        this.tokens.set(id, { ...token, revokedAt: this.clock.now() });
        revoked += 1;
      }
    }
    return revoked;
  }

  async listActiveSessions(userId: string): Promise<ActiveSession[]> {
    return [...this.tokens.values()]
      .filter(
        (token) =>
          token.userId === userId &&
          token.revokedAt === null &&
          token.expiresAt.getTime() > this.clock.now().getTime(),
      )
      .map((token) => ({
        id: token.id,
        userAgent: token.userAgent,
        ipAddress: token.ipAddress,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
      }));
  }

  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const [id, token] of this.tokens) {
      if (token.expiresAt < cutoff) {
        this.tokens.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  /** Cuantos tokens vigentes tiene el usuario. */
  activeCount(userId: string): number {
    return [...this.tokens.values()].filter(
      (token) => token.userId === userId && token.revokedAt === null,
    ).length;
  }
}

export function makeUserWithRole(overrides: Partial<UserWithRole> = {}): UserWithRole {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'user-1',
    roleId: 'role-admin',
    roleName: 'admin',
    firstName: 'Hidekel',
    lastName: 'Reyes',
    email: 'admin@ejghautoimport.com',
    passwordHash: '$2b$10$hash',
    phone: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

/** Solo implementa lo que necesitan los casos de uso de sesion. */
export class FakeUserRepository implements UserRepository {
  readonly users = new Map<string, UserWithRole>();

  constructor(initial: UserWithRole[] = []) {
    for (const user of initial) {
      this.users.set(user.id, user);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByIdWithRole(id: string): Promise<UserWithRole | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserWithRole | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async existsByEmail(): Promise<boolean> {
    return false;
  }

  async list(_filters: UserFilters, _page: PageQuery): Promise<PaginatedResult<UserWithRole>> {
    throw new Error('no usado en estos tests');
  }

  async create(_data: NewUser): Promise<User> {
    throw new Error('no usado en estos tests');
  }

  async update(id: string, data: UserUpdate): Promise<User | null> {
    const existing = this.users.get(id);
    if (existing === undefined) {
      return null;
    }
    const updated = { ...existing, ...data };
    this.users.set(id, updated);
    return updated;
  }

  async softDelete(): Promise<boolean> {
    return true;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    const existing = this.users.get(id);
    if (existing !== undefined) {
      this.users.set(id, { ...existing, lastLoginAt: at });
    }
  }
}
