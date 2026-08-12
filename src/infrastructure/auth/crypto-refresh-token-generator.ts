import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenGenerator } from '../../domain/users/refresh-token.entity';

/**
 * Genera secretos de refresco con el CSPRNG del sistema y los resume con
 * SHA-256 para guardarlos.
 *
 * A diferencia de las contrasenas, aqui NO se usa bcrypt: un refresh token son
 * 384 bits aleatorios, no una frase elegida por una persona, asi que no hay
 * nada que un ataque de diccionario pueda aprovechar y el coste deliberado de
 * bcrypt solo aniadiria latencia a cada refresco. SHA-256 basta para que quien
 * lea la tabla no pueda reconstruir el token.
 */
export class CryptoRefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): string {
    return randomBytes(48).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
