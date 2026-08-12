import bcrypt from 'bcrypt';
import type { PasswordHasher } from '../../domain/users/password-hasher';

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly saltRounds: number) {}

  hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, this.saltRounds);
  }

  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, passwordHash);
    } catch {
      // Un hash corrupto o con formato desconocido no debe tumbar el login:
      // simplemente no coincide.
      return false;
    }
  }
}
