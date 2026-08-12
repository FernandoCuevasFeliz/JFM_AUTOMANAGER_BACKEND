/**
 * Puerto de hashing de contrasenas. El dominio no sabe que se usa bcrypt;
 * `infrastructure/auth/bcrypt-password-hasher.ts` lo implementa.
 */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  compare(plainPassword: string, passwordHash: string): Promise<boolean>;
}
