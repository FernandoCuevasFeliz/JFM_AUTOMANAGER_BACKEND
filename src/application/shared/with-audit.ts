import type {
  AuditAction,
  AuditContextProvider,
  AuditLogRepository,
  AuditSnapshotReader,
} from '../../domain/shared/audit';
import type { UseCase } from './use-case';

/**
 * Describe que se debe registrar en `audit_logs` cuando un caso de uso de
 * escritura termina bien.
 */
export interface AuditDescriptor<Input, Output> {
  /** Tabla afectada, tal cual se llama en la base. */
  readonly table: string;
  readonly action: AuditAction;
  /**
   * Id del registro tomado de la entrada. Necesario en `update` y `delete`
   * para capturar el estado previo antes de tocarlo.
   */
  readonly recordIdFromInput?: (input: Input) => string | undefined;
  /** Id del registro tomado de la salida. Necesario en `insert`. */
  readonly recordIdFromOutput?: (output: Output) => string | undefined;
}

export interface AuditDependencies {
  readonly auditLogs: AuditLogRepository;
  readonly snapshots: AuditSnapshotReader;
  readonly context: AuditContextProvider;
  /**
   * Se invoca si la auditoria falla. Nunca se propaga el error: perder un
   * registro de auditoria no debe tumbar una operacion de negocio ya
   * confirmada. La implementacion concreta lo manda al log.
   */
  readonly onFailure?: (error: unknown) => void;
}

/**
 * Envuelve un caso de uso para que su escritura quede auditada sin que el caso
 * de uso sepa nada de `audit_logs`.
 *
 * Se aplica en el composition root (`main/container.ts`), de modo que la lista
 * de operaciones auditadas se lee de un vistazo en un solo archivo en lugar de
 * estar repartida por todos los modulos.
 *
 * El `old_data` se toma ANTES de ejecutar y el `new_data` DESPUES, leyendo la
 * fila cruda con `AuditSnapshotReader`. Si el caso de uso devuelve `Err` no se
 * registra nada: no hubo cambio que auditar.
 */
export function withAudit<Input, Output>(
  useCase: UseCase<Input, Output>,
  descriptor: AuditDescriptor<Input, Output>,
  deps: AuditDependencies,
): UseCase<Input, Output> {
  return {
    async execute(input) {
      const previousId = descriptor.recordIdFromInput?.(input);

      const oldData =
        descriptor.action !== 'insert' && previousId !== undefined
          ? await safe(() => deps.snapshots.snapshot(descriptor.table, previousId), deps)
          : null;

      const result = await useCase.execute(input);

      if (!result.ok) {
        return result;
      }

      const recordId = descriptor.recordIdFromOutput?.(result.value) ?? previousId ?? null;

      const newData =
        descriptor.action === 'delete' || recordId === null
          ? null
          : await safe(() => deps.snapshots.snapshot(descriptor.table, recordId), deps);

      const actor = deps.context.getActor();

      await safe(
        () =>
          deps.auditLogs.record({
            userId: actor.userId,
            ipAddress: actor.ipAddress,
            tableName: descriptor.table,
            recordId,
            action: descriptor.action,
            oldData,
            newData,
          }),
        deps,
      );

      return result;
    },
  };
}

async function safe<T>(operation: () => Promise<T>, deps: AuditDependencies): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    deps.onFailure?.(error);
    return null;
  }
}
