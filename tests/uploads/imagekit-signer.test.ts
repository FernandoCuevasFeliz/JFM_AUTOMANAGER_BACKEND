import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ImageKitNotConfiguredError,
  ImageKitSigner,
} from '../../src/infrastructure/uploads/imagekit-signer';

const PRIVATE_KEY = 'private_TESTKEY1234567890';
const NOW = new Date('2026-03-05T14:22:31.000Z'); // 1772720551 en epoch

function buildSigner(overrides: Partial<ConstructorParameters<typeof ImageKitSigner>[0]> = {}) {
  return new ImageKitSigner({
    privateKey: PRIVATE_KEY,
    publicKey: 'public_TESTKEY',
    expirySeconds: 2400,
    ...overrides,
  });
}

describe('firma de subidas a ImageKit', () => {
  it('firma HMAC-SHA1 sobre token + expire con la clave privada', () => {
    const params = buildSigner().sign(NOW);

    const expected = createHmac('sha1', PRIVATE_KEY)
      .update(params.token + String(params.expire))
      .digest('hex');

    expect(params.signature).toBe(expected);
  });

  it('caduca a los segundos configurados', () => {
    const params = buildSigner({ expirySeconds: 600 }).sign(NOW);

    expect(params.expire).toBe(Math.floor(NOW.getTime() / 1000) + 600);
  });

  it('genera un token distinto en cada firma', () => {
    const signer = buildSigner();

    // El token identifica una subida concreta: reutilizarlo permitiria repetir
    // una peticion ya consumida.
    expect(signer.sign(NOW).token).not.toBe(signer.sign(NOW).token);
  });

  it('incluye la clave publica cuando esta configurada', () => {
    expect(buildSigner().sign(NOW).publicKey).toBe('public_TESTKEY');
  });

  it('omite la clave publica si no se configuro', () => {
    const params = buildSigner({ publicKey: undefined }).sign(NOW);

    expect(params).not.toHaveProperty('publicKey');
  });

  it('nunca expone la clave privada en el resultado', () => {
    const params = buildSigner().sign(NOW);

    expect(JSON.stringify(params)).not.toContain(PRIVATE_KEY);
  });

  it('falla de forma explicita si falta la clave privada', () => {
    const signer = buildSigner({ privateKey: undefined });

    expect(signer.isConfigured).toBe(false);
    expect(() => signer.sign(NOW)).toThrow(ImageKitNotConfiguredError);
  });

  it('trata una clave privada vacia como ausente', () => {
    const signer = buildSigner({ privateKey: '' });

    expect(signer.isConfigured).toBe(false);
    expect(() => signer.sign(NOW)).toThrow(ImageKitNotConfiguredError);
  });
});
