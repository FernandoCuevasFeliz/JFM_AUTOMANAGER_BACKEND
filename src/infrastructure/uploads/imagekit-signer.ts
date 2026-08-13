import { createHmac, randomUUID } from 'node:crypto';

/**
 * Firma de subidas directas a ImageKit.
 *
 * El SDK de ImageKit en el navegador sube el archivo por su cuenta, pero exige
 * tres parametros que solo puede calcular el servidor:
 *
 *   token      identificador unico de la subida
 *   expire     marca de tiempo Unix hasta la que la firma es valida
 *   signature  HMAC-SHA1 de `token + expire` con la clave PRIVADA
 *
 * La clave privada nunca sale de aqui: si viajara al cliente, cualquiera podria
 * subir archivos a la cuenta.
 */

export interface ImageKitAuthParams {
  readonly token: string;
  readonly expire: number;
  readonly signature: string;
  /**
   * Se devuelve por comodidad para que el cliente no tenga que configurarla
   * tambien por su lado. Es publica por diseno.
   */
  readonly publicKey?: string;
}

export interface ImageKitSignerConfig {
  readonly privateKey?: string;
  readonly publicKey?: string;
  readonly expirySeconds: number;
}

/** El endpoint no puede firmar nada si falta la clave privada. */
export class ImageKitNotConfiguredError extends Error {
  constructor() {
    super(
      'La firma de subidas a ImageKit no esta configurada: falta IMAGEKIT_PRIVATE_KEY en el entorno del servidor',
    );
    this.name = 'ImageKitNotConfiguredError';
  }
}

export class ImageKitSigner {
  constructor(private readonly config: ImageKitSignerConfig) {}

  get isConfigured(): boolean {
    return typeof this.config.privateKey === 'string' && this.config.privateKey.length > 0;
  }

  /**
   * Genera un juego de parametros de un solo uso.
   *
   * `now` se inyecta para poder fijar el tiempo en las pruebas.
   */
  sign(now: Date = new Date()): ImageKitAuthParams {
    const { privateKey, publicKey, expirySeconds } = this.config;

    if (privateKey === undefined || privateKey.length === 0) {
      throw new ImageKitNotConfiguredError();
    }

    const token = randomUUID();
    const expire = Math.floor(now.getTime() / 1000) + expirySeconds;

    const signature = createHmac('sha1', privateKey)
      .update(token + String(expire))
      .digest('hex');

    return {
      token,
      expire,
      signature,
      ...(publicKey !== undefined && publicKey.length > 0 ? { publicKey } : {}),
    };
  }
}
