import type { DomainError } from '../../domain/shared/domain-error';
import type { Result } from '../../domain/shared/result';

/**
 * Contrato unico de todos los casos de uso.
 *
 * Devuelven `Result` en lugar de lanzar: los errores de negocio son parte del
 * contrato del caso de uso, no una excepcion. Solo se propagan excepciones
 * ante fallos inesperados de infraestructura.
 */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Result<Output, DomainError>>;
}

/** Caso de uso sin parametros de entrada. */
export type QueryUseCase<Output> = UseCase<void, Output>;

/** Datos del usuario autenticado que necesitan los casos de uso de escritura. */
export interface ActorInput {
  readonly actorUserId: string;
}

/**
 * Extrae el contrato `UseCase<Input, Output>` de una clase concreta.
 *
 * Los controladores dependen de `UseCaseOf<CreateVehicleUseCase>` y no de
 * `CreateVehicleUseCase`: asi el composition root puede inyectar la version
 * envuelta por el decorador de auditoria, que cumple el contrato pero no es
 * una instancia de la clase.
 */
export type UseCaseOf<T> = T extends UseCase<infer Input, infer Output>
  ? UseCase<Input, Output>
  : never;
