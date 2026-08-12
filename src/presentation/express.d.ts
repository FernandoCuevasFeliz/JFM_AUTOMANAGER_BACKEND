import type { AuthenticatedUser } from '../domain/users/token-service';

/**
 * Extension del `Request` de Express con la identidad ya verificada.
 * La rellena `authMiddleware`; es `undefined` en rutas publicas.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};
