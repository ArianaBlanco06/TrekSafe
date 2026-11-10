import { randomUUID } from 'node:crypto';
import { ErrorCoordinacion } from '../../../domain/errors/ErrorCoordinacion.js';
import type {
  Coordinacion,
  IIncidenteDAO,
  Incidente,
  ResultadoAsuncion,
  SolicitudAsuncion,
} from '../../../domain/repositories/IIncidenteDAO.js';

type FilaIncidente = { incidente: Incidente; operacionId: string };

/**
 * Doble de prueba de `IIncidenteDAO`. Replica solo lo que necesitan las pruebas del caso
 * de uso, en el orden de la RPC treksafe_asumir_coordinacion (017): operación existente,
 * operación de otro tipo, rescatista validado, alerta, incidente vigente.
 *
 * La exclusión por expedición es una cola de promesas (el FOR UPDATE de la RPC). La
 * evidencia real de concurrencia está en la suite PostgreSQL (test-hu39-postgres.mjs).
 */
export class IncidenteDAOMemoria implements IIncidenteDAO {
  readonly filas: FilaIncidente[] = [];
  /** `operacionId` ya usados por otro tipo de operación (eventos del plan). */
  readonly operacionesDeOtroTipo = new Set<string>();
  llamadasAsumir = 0;

  private readonly colas = new Map<string, Promise<unknown>>();

  /**
   * @param rescatistas id → nombre completo de los rescatistas validados.
   * @param alertas id de expedición → estado de la expedición.
   */
  constructor(
    private readonly rescatistas: ReadonlyMap<string, string>,
    private readonly alertas: Map<string, string>,
  ) {}

  /** Inserta un incidente ya existente (por ejemplo, uno cerrado). */
  sembrar(incidente: Incidente, operacionId = randomUUID()): void {
    this.filas.push({ incidente, operacionId });
  }

  async asumir(solicitud: SolicitudAsuncion): Promise<ResultadoAsuncion> {
    this.llamadasAsumir += 1;
    const anterior = this.colas.get(solicitud.expedicionId) ?? Promise.resolve();
    const actual = anterior.catch(() => undefined).then(() => this.asumirBloqueado(solicitud));
    this.colas.set(solicitud.expedicionId, actual);
    return actual;
  }

  private async asumirBloqueado(solicitud: SolicitudAsuncion): Promise<ResultadoAsuncion> {
    await Promise.resolve(); // cede el turno: sin la cola, dos llamadas se entrelazarían aquí

    const registrada = this.filas.find((f) => f.operacionId === solicitud.operacionId);
    if (registrada) {
      const { incidente } = registrada;
      if (
        incidente.responsableId === solicitud.rescatistaId &&
        incidente.expedicionId === solicitud.expedicionId
      ) {
        return { incidente, repetido: true };
      }
      throw new ErrorCoordinacion('ALERTA_NO_ENCONTRADA');
    }
    if (this.operacionesDeOtroTipo.has(solicitud.operacionId)) {
      throw new ErrorCoordinacion('DATOS_INVALIDOS');
    }

    const nombre = this.rescatistas.get(solicitud.rescatistaId);
    if (nombre === undefined) throw new ErrorCoordinacion('NO_ES_RESCATISTA');

    if (this.alertas.get(solicitud.expedicionId) !== 'alerta') {
      throw new ErrorCoordinacion('ALERTA_NO_ENCONTRADA');
    }

    const vigente = this.filas.find(
      (f) => f.incidente.expedicionId === solicitud.expedicionId && f.incidente.estado !== 'cerrado',
    );
    if (vigente) {
      if (vigente.incidente.responsableId === solicitud.rescatistaId) {
        return { incidente: vigente.incidente, repetido: true };
      }
      throw new ErrorCoordinacion('COORDINACION_YA_ASUMIDA', {
        responsableId: vigente.incidente.responsableId,
        nombreResponsable: vigente.incidente.nombreResponsable,
      });
    }

    // Entre comprobar y escribir (la RPC lo hace con la expedición bloqueada) se cede el turno:
    // sin la cola por expedición, dos asunciones simultáneas pasarían ambas la comprobación.
    await Promise.resolve();

    const incidente: Incidente = {
      id: randomUUID(),
      expedicionId: solicitud.expedicionId,
      estado: 'abierto',
      version: 1,
      responsableId: solicitud.rescatistaId,
      nombreResponsable: nombre,
      asumidoEn: new Date().toISOString(),
    };
    this.filas.push({ incidente, operacionId: solicitud.operacionId });
    return { incidente, repetido: false };
  }

  async leerCoordinaciones(
    expedicionIds: readonly string[],
    rescatistaId: string,
  ): Promise<Map<string, Coordinacion>> {
    const resultado = new Map<string, Coordinacion>();
    for (const { incidente } of this.filas) {
      if (incidente.estado === 'cerrado' || !expedicionIds.includes(incidente.expedicionId)) continue;
      resultado.set(incidente.expedicionId, {
        incidenteId: incidente.id,
        version: incidente.version,
        responsableId: incidente.responsableId,
        nombreResponsable: incidente.nombreResponsable,
        asumidoEn: incidente.asumidoEn,
        esMia: incidente.responsableId === rescatistaId,
      });
    }
    return resultado;
  }
}
