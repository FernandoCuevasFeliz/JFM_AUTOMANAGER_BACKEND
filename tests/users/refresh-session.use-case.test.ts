import { beforeEach, describe, expect, it } from 'vitest';
import { SessionIssuer } from '../../src/application/users/issue-session';
import { LogoutUseCase } from '../../src/application/users/logout.use-case';
import { RefreshSessionUseCase } from '../../src/application/users/refresh-session.use-case';
import {
  FakeRefreshTokenGenerator,
  FakeRefreshTokenRepository,
  FakeTokenService,
  FakeUserRepository,
  FixedClock,
  makeUserWithRole,
} from '../helpers/fake-auth';

const REFRESH_TTL_DAYS = 30;

describe('RefreshSessionUseCase', () => {
  let clock: FixedClock;
  let refreshTokens: FakeRefreshTokenRepository;
  let users: FakeUserRepository;
  let generator: FakeRefreshTokenGenerator;
  let issuer: SessionIssuer;
  let useCase: RefreshSessionUseCase;

  const context = { userAgent: 'Firefox/128', ipAddress: '190.80.1.1' };

  /** Abre una sesion y devuelve el refresh token en claro. */
  async function openSession(userId = 'user-1'): Promise<string> {
    const user = users.users.get(userId);
    if (user === undefined) {
      throw new Error('usuario de prueba inexistente');
    }
    const session = await issuer.issue(user, context);
    return session.refreshToken;
  }

  beforeEach(() => {
    clock = new FixedClock(new Date('2026-03-01T12:00:00Z'));
    refreshTokens = new FakeRefreshTokenRepository(clock);
    users = new FakeUserRepository([makeUserWithRole()]);
    generator = new FakeRefreshTokenGenerator();
    issuer = new SessionIssuer(
      new FakeTokenService(),
      refreshTokens,
      generator,
      clock,
      REFRESH_TTL_DAYS,
    );
    useCase = new RefreshSessionUseCase(refreshTokens, users, generator, issuer, clock);
  });

  it('entrega un par nuevo y rota el refresh token usado', async () => {
    const original = await openSession();

    const result = await useCase.execute({ refreshToken: original, ...context });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.refreshToken).not.toBe(original);
    expect(result.value.accessToken).toBe('jwt-for-user-1');

    // El token viejo queda revocado y solo el nuevo sigue vigente.
    const rotated = await refreshTokens.findByHash(generator.hash(original));
    expect(rotated?.revokedAt).not.toBeNull();
    expect(refreshTokens.activeCount('user-1')).toBe(1);
  });

  it('nunca guarda el refresh token en claro', async () => {
    const original = await openSession();

    const stored = [...refreshTokens.tokens.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(generator.hash(original));
    expect(stored[0]?.tokenHash).not.toBe(original);
  });

  it('rechaza un token inexistente', async () => {
    const result = await useCase.execute({ refreshToken: 'inventado', ...context });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.httpStatus).toBe(401);
  });

  it('rechaza un token vencido', async () => {
    const original = await openSession();
    clock.advanceDays(REFRESH_TTL_DAYS + 1);

    const result = await useCase.execute({ refreshToken: original, ...context });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('ante la reutilizacion de un token ya rotado cierra TODAS las sesiones', async () => {
    const robado = await openSession();

    // Uso legitimo: el token queda rotado.
    const legitimo = await useCase.execute({ refreshToken: robado, ...context });
    expect(legitimo.ok).toBe(true);
    expect(refreshTokens.activeCount('user-1')).toBe(1);

    // El atacante presenta la copia que conservaba.
    const reuso = await useCase.execute({ refreshToken: robado, ...context });

    expect(reuso.ok).toBe(false);
    if (reuso.ok) {
      return;
    }
    expect(reuso.error.message).toContain('uso indebido');

    // No queda ninguna sesion viva: ni la del atacante ni la de la victima.
    expect(refreshTokens.activeCount('user-1')).toBe(0);
  });

  it('corta la sesion de un usuario desactivado y revoca sus tokens', async () => {
    const original = await openSession();
    users.users.set('user-1', makeUserWithRole({ isActive: false }));

    const result = await useCase.execute({ refreshToken: original, ...context });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('inactivo');
    expect(refreshTokens.activeCount('user-1')).toBe(0);
  });

  it('mantiene independientes las sesiones de distintos dispositivos', async () => {
    const movil = await openSession();
    const escritorio = await openSession();

    await useCase.execute({ refreshToken: movil, ...context });

    // Rotar la del movil no debe tumbar la de escritorio.
    const sigueViva = await refreshTokens.findByHash(generator.hash(escritorio));
    expect(sigueViva?.revokedAt).toBeNull();
    expect(refreshTokens.activeCount('user-1')).toBe(2);
  });
});

describe('LogoutUseCase', () => {
  it('revoca el token presentado y es idempotente', async () => {
    const clock = new FixedClock(new Date('2026-03-01T12:00:00Z'));
    const refreshTokens = new FakeRefreshTokenRepository(clock);
    const generator = new FakeRefreshTokenGenerator();
    const issuer = new SessionIssuer(new FakeTokenService(), refreshTokens, generator, clock, 30);
    const logout = new LogoutUseCase(refreshTokens, generator);

    const session = await issuer.issue(makeUserWithRole(), {
      userAgent: null,
      ipAddress: null,
    });

    expect((await logout.execute({ refreshToken: session.refreshToken })).ok).toBe(true);
    expect(refreshTokens.activeCount('user-1')).toBe(0);

    // Repetir el cierre de sesion no es un error.
    expect((await logout.execute({ refreshToken: session.refreshToken })).ok).toBe(true);
  });

  it('responde bien aunque el token no exista, sin revelar si era valido', async () => {
    const clock = new FixedClock(new Date('2026-03-01T12:00:00Z'));
    const refreshTokens = new FakeRefreshTokenRepository(clock);
    const logout = new LogoutUseCase(refreshTokens, new FakeRefreshTokenGenerator());

    expect((await logout.execute({ refreshToken: 'inventado' })).ok).toBe(true);
  });
});
