import type { NextFunction, Request, Response } from 'express';
import type { ImageKitSigner } from '../../../infrastructure/uploads/imagekit-signer';

export interface UploadsControllerDeps {
  readonly imageKitSigner: ImageKitSigner;
}

/**
 * Parametros de firma para que el navegador suba imagenes a ImageKit.
 *
 * No hay caso de uso detras porque no hay regla de negocio ni persistencia: es
 * un calculo criptografico puro sobre una clave de configuracion. Por eso el
 * controlador habla directamente con la infraestructura que firma.
 */
export class UploadsController {
  constructor(private readonly deps: UploadsControllerDeps) {}

  imageKitAuth = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const params = this.deps.imageKitSigner.sign();

      // La firma es de un solo uso y caduca: que ningun proxy la guarde.
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ data: params });
    } catch (error) {
      // Si falta la clave privada es un fallo de despliegue, no del cliente:
      // el error-handler lo registra con su stack y responde 500.
      next(error);
    }
  };
}
