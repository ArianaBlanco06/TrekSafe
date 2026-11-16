import { ErrorBitacoraIncidente } from '../../../domain/errors/ErrorBitacoraIncidente.js';
import { ErrorCierreIncidente } from '../../../domain/errors/ErrorCierreIncidente.js';
import type {
  ICierreIncidenteDAO,
  InformeCierre,
  ResultadoLocalizacion,
  ResultadoRegistroCierre,
  SolicitudCierreIncidente,
  SolicitudLocalizacionIncidente,
} from '../../../domain/repositories/ICierreIncidenteDAO.js';
import {
  LIMITE_RESUMEN_CIERRE,
  RESULTADOS_RESCATE,
  TEXTO_ENTRADA_LOCALIZADO,
  admiteCierre,
  admiteLocalizar,
} from '../../../domain/value-objects/cierreIncidente.js';
import type { EstadoExpedicion } from '../../../domain/value-objects/enums.js';
import type { BitacoraIncidenteDAOMemoria } from './BitacoraIncidenteDAOMemoria.js';

type Localizacion = { incidenteId: string; rescatistaId: string };

/**
 * Doble de prueba de `ICierreIncidenteDAO`. Envuelve `BitacoraIncidenteDAOMemoria`, de modo
 * que comparte con ella el estado de los incidentes y las entradas (el cierre anexa la
 * entrada 'cierre' y cambia el estado en esa misma instancia).
 *
 * Replica el orden de comprobaciones de treksafe_cerrar_incidente (025): datos, repetición
 * por comando (antes de autorizar), incidente, cerrado, responsable, estado localizado,
 * entrada de cierre, informe y estado cerrado. La exclusión por incidente es una cola de
 * promesas (el FOR UPDATE de la RPC). La evidencia real de concurrencia está en la suite
 * PostgreSQL (test-hu42-postgres.mjs).
 *
 * NUNCA modifica el estado de la expedición (CA-3): solo lo lee.
 */
export class CierreIncidenteDAOMemoria implements ICierreIncidenteDAO {
  llamadasCerrar = 0;

  private readonly informes: { informe: InformeCierre; comandoId: string }[] = [];
  private readonly localizaciones = new Map<string, Localizacion>();
  private readonly expediciones = new Map<string, EstadoExpedicion>();
  private readonly colas = new Map<string, Promise<unknown>>();

  /** @param rescatistas id → nombre completo de los rescatistas validados. */
  constructor(
    private readonly bitacora: BitacoraIncidenteDAOMemoria,
    private readonly rescatistas: ReadonlyMap<string, string>,
  ) {}

  /** Método de prueba: registra el estado (leído, nunca escrito) de una expedición. */
  sembrarExpedicion(expedicionId: string, estado: EstadoExpedicion = 'alerta'): void {
    this.expediciones.set(expedicionId, estado);
  }

  /** Método de prueba: el estado de la expedición. El DAO nunca lo modifica. */
  estadoExpedicion(expedicionId: string): EstadoExpedicion {
    return this.expediciones.get(expedicionId) ?? 'alerta';
  }

  async cerrar(solicitud: SolicitudCierreIncidente): Promise<ResultadoRegistroCierre> {
    this.llamadasCerrar += 1;
    return this.enCola(solicitud.incidenteId, () => this.cerrarBloqueado(solicitud));
  }

  async marcarLocalizado(solicitud: SolicitudLocalizacionIncidente): Promise<ResultadoLocalizacion> {
    return this.enCola(solicitud.incidenteId, () => this.localizarBloqueado(solicitud));
  }

  async ultimoCierreDeExpedicion(expedicionId: string): Promise<InformeCierre | null> {
    const deLaExpedicion = this.informes
      .map((f) => f.informe)
      .filter((i) => i.expedicionId === expedicionId)
      .sort((a, b) => Date.parse(b.cerradoEn) - Date.parse(a.cerradoEn));
    const ultimo = deLaExpedicion[0];
    return ultimo ? Object.freeze({ ...ultimo, estadoExpedicion: this.estadoExpedicion(expedicionId) }) : null;
  }

  private enCola<T>(incidenteId: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = this.colas.get(incidenteId) ?? Promise.resolve();
    const actual = anterior.catch(() => undefined).then(tarea);
    this.colas.set(incidenteId, actual);
    return actual;
  }

  private async cerrarBloqueado(s: SolicitudCierreIncidente): Promise<ResultadoRegistroCierre> {
    await Promise.resolve(); // cede el turno: sin la cola, dos llamadas se entrelazarían aquí

    if (!(RESULTADOS_RESCATE as readonly string[]).includes(s.resultado)) throw new ErrorCierreIncidente('DATOS_INVALIDOS');
    const resumen = s.resumen.trim();
    if (resumen.length < 1 || resumen.length > LIMITE_RESUMEN_CIERRE) throw new ErrorCierreIncidente('DATOS_INVALIDOS');

    // Repetición: se resuelve antes de autorizar (el reintento sobrevive a un relevo).
    const repetido = this.repeticion(s, resumen);
    if (repetido) return repetido;

    const bitacora = await this.bitacora.listar(s.incidenteId);
    if (!bitacora) throw new ErrorCierreIncidente('INCIDENTE_NO_ENCONTRADO');
    const incidente = bitacora.incidente;
    if (incidente.estado === 'cerrado') {
      throw new ErrorCierreIncidente('INCIDENTE_CERRADO');
    }
    if (incidente.responsableId !== s.rescatistaId) {
      throw new ErrorCierreIncidente('NO_ES_RESPONSABLE', {
        responsableId: incidente.responsableId,
        nombreResponsable: incidente.nombreResponsable,
      });
    }
    if (!admiteCierre(incidente.estado)) throw new ErrorCierreIncidente('INCIDENTE_NO_LOCALIZADO');

    let entrada;
    try {
      entrada = this.bitacora.anexarInterna(s.incidenteId, s.rescatistaId, 'cierre', resumen, s.comandoId);
    } catch (e) {
      if (e instanceof ErrorBitacoraIncidente && e.codigo === 'OPERACION_YA_REGISTRADA') {
        throw new ErrorCierreIncidente('OPERACION_YA_REGISTRADA');
      }
      throw e;
    }

    // Entre comprobar y escribir (la RPC lo hace con la fila bloqueada) se cede el turno.
    await Promise.resolve();

    const informe: InformeCierre = Object.freeze({
      id: crypto.randomUUID(),
      incidenteId: s.incidenteId,
      expedicionId: incidente.expedicionId,
      resultado: s.resultado,
      resumen,
      cerradoPorId: s.rescatistaId,
      nombreCerradoPor: this.nombreDe(s.rescatistaId),
      cerradoEn: entrada.registradaEn,
      entradaBitacoraId: entrada.id,
      estadoExpedicion: this.estadoExpedicion(incidente.expedicionId),
    });
    this.informes.push({ informe, comandoId: s.comandoId });
    this.bitacora.cambiarEstado(s.incidenteId, 'cerrado');
    return { informe, repetido: false };
  }

  private repeticion(s: SolicitudCierreIncidente, resumen: string): ResultadoRegistroCierre | null {
    const previo = this.informes.find((f) => f.comandoId === s.comandoId)?.informe;
    if (!previo) return null;
    if (
      previo.incidenteId === s.incidenteId &&
      previo.cerradoPorId === s.rescatistaId &&
      previo.resultado === s.resultado &&
      previo.resumen === resumen
    ) {
      return {
        informe: Object.freeze({ ...previo, estadoExpedicion: this.estadoExpedicion(previo.expedicionId) }),
        repetido: true,
      };
    }
    throw new ErrorCierreIncidente('OPERACION_YA_REGISTRADA');
  }

  private async localizarBloqueado(s: SolicitudLocalizacionIncidente): Promise<ResultadoLocalizacion> {
    await Promise.resolve();

    const previa = this.localizaciones.get(s.operacionId);
    if (previa) {
      if (previa.incidenteId !== s.incidenteId || previa.rescatistaId !== s.rescatistaId) {
        throw new ErrorCierreIncidente('OPERACION_YA_REGISTRADA');
      }
      return { incidente: await this.estadoActual(s.incidenteId), repetido: true };
    }
    if (this.informes.some((f) => f.comandoId === s.operacionId)) {
      throw new ErrorCierreIncidente('OPERACION_YA_REGISTRADA');
    }

    const bitacora = await this.bitacora.listar(s.incidenteId);
    if (!bitacora) throw new ErrorCierreIncidente('INCIDENTE_NO_ENCONTRADO');
    const incidente = bitacora.incidente;
    if (incidente.estado === 'cerrado') throw new ErrorCierreIncidente('INCIDENTE_CERRADO');
    if (incidente.responsableId !== s.rescatistaId) {
      throw new ErrorCierreIncidente('NO_ES_RESPONSABLE', {
        responsableId: incidente.responsableId,
        nombreResponsable: incidente.nombreResponsable,
      });
    }
    if (!admiteLocalizar(incidente.estado)) {
      // Ya localizado: sin escribir nada.
      return { incidente: await this.estadoActual(s.incidenteId), repetido: true };
    }

    try {
      this.bitacora.anexarInterna(s.incidenteId, s.rescatistaId, 'nota', TEXTO_ENTRADA_LOCALIZADO, s.operacionId);
    } catch (e) {
      if (e instanceof ErrorBitacoraIncidente && e.codigo === 'OPERACION_YA_REGISTRADA') {
        throw new ErrorCierreIncidente('OPERACION_YA_REGISTRADA');
      }
      throw e;
    }
    await Promise.resolve();
    this.bitacora.cambiarEstado(s.incidenteId, 'localizado');
    this.localizaciones.set(s.operacionId, { incidenteId: s.incidenteId, rescatistaId: s.rescatistaId });
    return { incidente: await this.estadoActual(s.incidenteId), repetido: false };
  }

  private async estadoActual(incidenteId: string): Promise<ResultadoLocalizacion['incidente']> {
    const bitacora = await this.bitacora.listar(incidenteId);
    if (!bitacora) throw new ErrorCierreIncidente('INCIDENTE_NO_ENCONTRADO');
    const { id, expedicionId, estado, version, responsableId, nombreResponsable } = bitacora.incidente;
    return Object.freeze({ id, expedicionId, estado, version, responsableId, nombreResponsable });
  }

  private nombreDe(rescatistaId: string): string {
    return this.rescatistas.get(rescatistaId) ?? 'Rescatista';
  }
}
