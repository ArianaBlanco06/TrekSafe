import { randomUUID } from 'node:crypto';
import {
  ErrorCoordinacion,
  type CodigoErrorRelevo,
  type DetalleErrorRelevo,
} from '../../../domain/errors/ErrorCoordinacion.js';
import type {
  Coordinacion,
  IIncidenteDAO,
  IRelevoDAO,
  Incidente,
  Relevo,
  RelevoPendiente,
  ResultadoAsuncion,
  ResultadoRelevo,
  SolicitudAceptarRelevo,
  SolicitudAsuncion,
  SolicitudProponerRelevo,
} from '../../../domain/repositories/IIncidenteDAO.js';

type FilaIncidente = { incidente: Incidente; operacionId: string };
type FilaRelevo = {
  relevo: Relevo;
  incidenteId: string;
  operacionId: string;
  operacionAceptacionId: string | null;
};
/** Evento de transferencia (tabla `transferencias_coordinacion`): solo se anexa. */
export type TransferenciaRegistrada = {
  incidenteId: string;
  relevoId: string;
  responsableAnteriorId: string;
  responsableNuevoId: string;
  motivo: string;
  versionAnterior: number;
  versionNueva: number;
  ocurridoEn: string;
};

const MOTIVO_MAXIMO = 280;

const rechazoRelevo = (codigo: CodigoErrorRelevo, detalle?: DetalleErrorRelevo) =>
  new ErrorCoordinacion<CodigoErrorRelevo>(codigo, undefined, detalle);

/**
 * Doble de prueba de `IIncidenteDAO`. Replica solo lo que necesitan las pruebas del caso
 * de uso, en el orden de la RPC treksafe_asumir_coordinacion (017): operación existente,
 * operación de otro tipo, rescatista validado, alerta, incidente vigente.
 *
 * La exclusión por expedición es una cola de promesas (el FOR UPDATE de la RPC). La
 * evidencia real de concurrencia está en la suite PostgreSQL (test-hu39-postgres.mjs).
 */
export class IncidenteDAOMemoria implements IIncidenteDAO, IRelevoDAO {
  readonly filas: FilaIncidente[] = [];
  readonly relevos: FilaRelevo[] = [];
  readonly transferencias: TransferenciaRegistrada[] = [];
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
    return this.serializar(solicitud.expedicionId, () => this.asumirBloqueado(solicitud));
  }

  /** Exclusión por expedición: el equivalente en memoria del FOR UPDATE de las RPC. */
  private serializar<T>(expedicionId: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = this.colas.get(expedicionId) ?? Promise.resolve();
    const actual = anterior.catch(() => undefined).then(tarea);
    this.colas.set(expedicionId, actual);
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
      const coordinacion: Coordinacion = {
        incidenteId: incidente.id,
        version: incidente.version,
        responsableId: incidente.responsableId,
        nombreResponsable: incidente.nombreResponsable,
        asumidoEn: incidente.asumidoEn,
        esMia: incidente.responsableId === rescatistaId,
      };
      const pendiente = this.relevos.find(
        (r) => r.incidenteId === incidente.id && r.relevo.estado === 'pendiente',
      );
      // La clave solo existe con un relevo pendiente: sin él, la forma es la de HU-39.
      if (pendiente) coordinacion.relevoPendiente = this.verPendiente(pendiente.relevo, rescatistaId);
      resultado.set(incidente.expedicionId, coordinacion);
    }
    return resultado;
  }

  /** El motivo solo lo ven las dos partes del relevo. */
  private verPendiente(relevo: Relevo, rescatistaId: string): RelevoPendiente {
    const visto: RelevoPendiente = {
      relevoId: relevo.id,
      destinatarioId: relevo.destinatarioId,
      nombreDestinatario: relevo.nombreDestinatario,
      solicitadoEn: relevo.solicitadoEn,
      esParaMi: relevo.destinatarioId === rescatistaId,
    };
    if (visto.esParaMi || relevo.responsableAnteriorId === rescatistaId) visto.motivo = relevo.motivo;
    return visto;
  }

  async proponerRelevo(solicitud: SolicitudProponerRelevo): Promise<ResultadoRelevo> {
    return this.serializar(solicitud.expedicionId, () => this.proponerRelevoBloqueado(solicitud));
  }

  async aceptarRelevo(solicitud: SolicitudAceptarRelevo): Promise<ResultadoRelevo> {
    return this.serializar(solicitud.expedicionId, () => this.aceptarRelevoBloqueado(solicitud));
  }

  private incidenteDe(incidenteId: string): Incidente {
    const fila = this.filas.find((f) => f.incidente.id === incidenteId);
    if (!fila) throw new Error(`Incidente ${incidenteId} no sembrado`);
    return fila.incidente;
  }

  private operacionUsadaPorOtroTipo(operacionId: string): boolean {
    return (
      this.operacionesDeOtroTipo.has(operacionId) ||
      this.filas.some((f) => f.operacionId === operacionId)
    );
  }

  private async proponerRelevoBloqueado(s: SolicitudProponerRelevo): Promise<ResultadoRelevo> {
    await Promise.resolve(); // cede el turno: sin la cola, dos llamadas se entrelazarían aquí

    // 1) Datos.
    const motivo = s.motivo.trim();
    if (motivo.length < 1 || motivo.length > MOTIVO_MAXIMO || s.versionIncidente < 1) {
      throw rechazoRelevo('DATOS_INVALIDOS');
    }

    // 2) Operación ya registrada: mismo actor y expedición → repetición; otra → no se revela nada.
    const registrada = this.relevos.find((r) => r.operacionId === s.operacionId);
    if (registrada) {
      const incidente = this.incidenteDe(registrada.incidenteId);
      if (registrada.relevo.responsableAnteriorId === s.rescatistaId && incidente.expedicionId === s.expedicionId) {
        return { incidente, relevo: registrada.relevo, repetido: true };
      }
      throw rechazoRelevo('INCIDENTE_NO_ENCONTRADO');
    }

    // 3) Operación ya usada en otro tipo de operación.
    if (
      this.operacionUsadaPorOtroTipo(s.operacionId) ||
      this.relevos.some((r) => r.operacionAceptacionId === s.operacionId)
    ) {
      throw rechazoRelevo('DATOS_INVALIDOS');
    }

    // 4) Actor validado.
    if (!this.rescatistas.has(s.rescatistaId)) throw rechazoRelevo('NO_ES_RESCATISTA');

    // 5) Incidente no cerrado de la expedición.
    const delaExpedicion = this.filas.filter((f) => f.incidente.expedicionId === s.expedicionId);
    const vigente = delaExpedicion.find((f) => f.incidente.estado !== 'cerrado');
    if (!vigente) {
      throw rechazoRelevo(delaExpedicion.length > 0 ? 'INCIDENTE_CERRADO' : 'INCIDENTE_NO_ENCONTRADO');
    }
    const incidente = vigente.incidente;

    // 6) a 8) Quién propone y a quién.
    if (incidente.responsableId !== s.rescatistaId) throw rechazoRelevo('NO_ES_RESPONSABLE');
    if (s.destinatarioId === s.rescatistaId) throw rechazoRelevo('DESTINATARIO_INVALIDO');
    const nombreDestinatario = this.rescatistas.get(s.destinatarioId);
    if (nombreDestinatario === undefined) throw rechazoRelevo('DESTINATARIO_NO_VALIDADO');

    // 9) Control optimista: solo al proponer.
    if (s.versionIncidente !== incidente.version) {
      throw rechazoRelevo('VERSION_DESACTUALIZADA', { versionActual: incidente.version });
    }

    // 10) Un solo relevo pendiente por incidente.
    const pendiente = this.relevos.find((r) => r.incidenteId === incidente.id && r.relevo.estado === 'pendiente');
    if (pendiente) {
      throw rechazoRelevo('RELEVO_PENDIENTE', {
        relevoPendiente: {
          relevoId: pendiente.relevo.id,
          destinatarioId: pendiente.relevo.destinatarioId,
          nombreDestinatario: pendiente.relevo.nombreDestinatario,
          solicitadoEn: pendiente.relevo.solicitadoEn,
        },
      });
    }

    // 11) Entre comprobar y escribir se cede el turno: la cola es lo que lo hace seguro.
    await Promise.resolve();
    const relevo: Relevo = {
      id: randomUUID(),
      estado: 'pendiente',
      responsableAnteriorId: s.rescatistaId,
      nombreResponsableAnterior: incidente.nombreResponsable,
      destinatarioId: s.destinatarioId,
      nombreDestinatario,
      motivo,
      solicitadoEn: new Date().toISOString(),
      resueltoEn: null,
      versionIncidente: incidente.version,
    };
    this.relevos.push({ relevo, incidenteId: incidente.id, operacionId: s.operacionId, operacionAceptacionId: null });
    return { incidente, relevo, repetido: false };
  }

  private async aceptarRelevoBloqueado(s: SolicitudAceptarRelevo): Promise<ResultadoRelevo> {
    await Promise.resolve();

    // 2) Operación de aceptación ya registrada.
    const registrada = this.relevos.find((r) => r.operacionAceptacionId === s.operacionId);
    if (registrada) {
      const incidente = this.incidenteDe(registrada.incidenteId);
      if (
        registrada.relevo.destinatarioId === s.rescatistaId &&
        registrada.relevo.id === s.relevoId &&
        incidente.expedicionId === s.expedicionId
      ) {
        return { incidente, relevo: registrada.relevo, repetido: true };
      }
      throw rechazoRelevo('RELEVO_NO_ENCONTRADO');
    }

    // 3) Operación ya usada como propuesta o en otro tipo de operación.
    if (this.operacionUsadaPorOtroTipo(s.operacionId) || this.relevos.some((r) => r.operacionId === s.operacionId)) {
      throw rechazoRelevo('DATOS_INVALIDOS');
    }

    // 4) Actor validado.
    if (!this.rescatistas.has(s.rescatistaId)) throw rechazoRelevo('NO_ES_RESCATISTA');

    // 5) El relevo existe y es de esa expedición.
    const fila = this.relevos.find((r) => r.relevo.id === s.relevoId);
    const filaIncidente = fila ? this.filas.find((f) => f.incidente.id === fila.incidenteId) : undefined;
    if (!fila || !filaIncidente || filaIncidente.incidente.expedicionId !== s.expedicionId) {
      throw rechazoRelevo('RELEVO_NO_ENCONTRADO');
    }

    // 7) Solo el destinatario acepta (antes de revelar el estado del relevo).
    if (fila.relevo.destinatarioId !== s.rescatistaId) throw rechazoRelevo('NO_ES_DESTINATARIO');

    // 8) Ya resuelto: la misma operación es repetición; otra no se confirma en silencio.
    if (fila.relevo.estado !== 'pendiente') {
      if (fila.operacionAceptacionId === s.operacionId) {
        return { incidente: filaIncidente.incidente, relevo: fila.relevo, repetido: true };
      }
      throw rechazoRelevo('RELEVO_YA_RESUELTO');
    }

    // 9) y 9b) Caso abierto y destinatario todavía validado. Aceptar no compara versión.
    if (filaIncidente.incidente.estado === 'cerrado') throw rechazoRelevo('INCIDENTE_CERRADO');
    const nombreNuevo = this.rescatistas.get(fila.relevo.destinatarioId);
    if (nombreNuevo === undefined) throw rechazoRelevo('DESTINATARIO_NO_VALIDADO');

    // 10) Aplicación completa (en la RPC, una sola transacción).
    await Promise.resolve();
    const ahora = new Date().toISOString();
    const anterior = filaIncidente.incidente;
    const incidente: Incidente = {
      ...anterior,
      responsableId: fila.relevo.destinatarioId,
      nombreResponsable: nombreNuevo,
      version: anterior.version + 1,
      asumidoEn: ahora,
    };
    filaIncidente.incidente = incidente;
    fila.relevo = { ...fila.relevo, estado: 'aceptado', resueltoEn: ahora };
    fila.operacionAceptacionId = s.operacionId;
    this.transferencias.push({
      incidenteId: incidente.id,
      relevoId: fila.relevo.id,
      responsableAnteriorId: fila.relevo.responsableAnteriorId,
      responsableNuevoId: fila.relevo.destinatarioId,
      motivo: fila.relevo.motivo,
      versionAnterior: anterior.version,
      versionNueva: incidente.version,
      ocurridoEn: ahora,
    });
    return { incidente, relevo: fila.relevo, repetido: false };
  }
}
