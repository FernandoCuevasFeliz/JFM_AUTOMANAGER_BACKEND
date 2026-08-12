import { describe, expect, it } from 'vitest';
import {
  isRefreshTokenExpired,
  isRefreshTokenUsable,
  type RefreshToken,
} from '../../src/domain/users/refresh-token.entity';

const NOW = new Date('2026-03-01T12:00:00Z');

function makeToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    tokenHash: 'abc',
    expiresAt: new Date('2026-03-31T12:00:00Z'),
    revokedAt: null,
    userAgent: null,
    ipAddress: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('vigencia del refresh token', () => {
  it('es usable mientras no este revocado ni vencido', () => {
    expect(isRefreshTokenUsable(makeToken(), NOW)).toBe(true);
  });

  it('deja de ser usable al revocarse', () => {
    expect(isRefreshTokenUsable(makeToken({ revokedAt: NOW }), NOW)).toBe(false);
  });

  it('deja de ser usable al vencer', () => {
    const vencido = makeToken({ expiresAt: new Date('2026-02-28T12:00:00Z') });
    expect(isRefreshTokenUsable(vencido, NOW)).toBe(false);
    expect(isRefreshTokenExpired(vencido, NOW)).toBe(true);
  });

  it('trata el instante exacto de vencimiento como vencido', () => {
    expect(isRefreshTokenExpired(makeToken({ expiresAt: NOW }), NOW)).toBe(true);
  });
});
