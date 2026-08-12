import { type Kysely, sql } from 'kysely';

/**
 * Tabla de refresh tokens (propuesta en el README y aprobada).
 *
 * Permite mantener la sesion abierta sin alargar la vigencia del access token
 * y, sobre todo, permite cerrar sesion del lado del servidor: un JWT firmado no
 * se puede invalidar, pero un refresh token guardado si.
 *
 * Decisiones de la tabla:
 *  - Se guarda el SHA-256 del token, nunca el token. Si alguien lee la tabla no
 *    puede suplantar a nadie, igual que con `users.password_hash`.
 *  - `ON DELETE CASCADE` desde `users`: los tokens de un usuario eliminado no
 *    tienen ningun valor historico (a diferencia de `audit_logs`, que usa
 *    SET NULL porque si debe sobrevivir).
 *  - `revoked_at` en lugar de borrar la fila: permite detectar la reutilizacion
 *    de un token ya rotado, que es la senal clasica de robo de credenciales.
 *  - `user_agent` e `ip_address` para que el usuario pueda reconocer sus
 *    sesiones activas.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  VARCHAR(255),
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sesiones activas de un usuario y limpieza de tokens vencidos.
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- La tabla se crea despues del loop generico de la migracion 001, asi que su
-- trigger de updated_at se declara aqui.
CREATE TRIGGER trg_refresh_tokens_updated_at
  BEFORE UPDATE ON refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`DROP TABLE IF EXISTS refresh_tokens;`).execute(db);
}
