import { randomUUID } from 'node:crypto';
import { ErrorBitacoraIncidente } from '../../../domain/errors/ErrorBitacoraIncidente.js';
import type {
  BitacoraIncidente,
  EntradaBitacora,
  IBitacoraIncidenteDAO,
  ResultadoEntradaBitacora,
  SolicitudEntradaBitacora,
  TipoEntradaBitacora,
} from '../../../domain/repositories/IBitacoraIncidenteDAO.js';
import type { EstadoIncidente } from '../../../domain/repositories/IIncidenteDAO.js';
import { LIMITE_TEXTO_ENTRADA_BITACORA } from '../../../domain/value-objects/entradaBitacora.js';

type FilaIncidente = {
  id: string;
  expedicionId: string;
  estado: EstadoIncidente;
  responsableId: string;
  version: number;
};

type FilaEntrada = { entrada: EntradaBitacora; secuencia: number; operacionId: string };

/**
 * Doble de prueba de `IBitacoraIncidenteDAO`. Replica el orden de comprobaciones de la RPC
 * treksafe_agregar_entrada_bitacora (019): datos, repetición (antes de autorizar), incidente,
 * cerrado, responsable, corrección e inserción.
 *
 * La exclusión por incidente es una cola de promesas (el FOR SHARE de la RPC frente al
 * relevo). La evidencia real de concurrencia está en la suite PostgreSQL
 * (test-hu41-postgres.mjs). No tiene métodos para actualizar ni eliminar entradas.
 */
export class BitacoraIncidenteDAOMemoria implements IBitacoraIncidenteDAO {
  /** `operacionId` ya usados por otro tipo de operación (incidentes, eventos del plan). */
  readonly operacionesDeOtroTipo = new Set<string>();
  llamadasAgregar = 0;

  private readonly incidentes = new Map<string, FilaIncidente>();
  private readonly entradas: FilaEntrada[] = [];
  private readonly colas = new Map<string, Promise<unknown>>();
  private ultimaHora = 0;
  private siguienteSecuencia = 1;

  /** @param rescatistas id → nombre completo de los rescatistas validados. */
  constructor(private readonly rescatistas: ReadonlyMap<string, string>) {}

  sembrarIncidente(i: {
    id: string;
    expedicionId: string;
    estado?: EstadoIncidente;
    responsableId: string;
    version?: number;
  }): void {
    this.incidentes.set(i.id, {
      id: i.id,
      expedicionId: i.expedicionId,
      estado: i.estado ?? 'abierto',
      responsableId: i.responsableId,
      version: i.version ?? 1,
    });
  }

  /** Simula el relevo de HU-40: cambia el responsable y sube la versión. */
  relevar(incidenteId: string, nuevoResponsableId: string): void {
    const incidente = this.exigirIncidente(incidenteId);
    incidente.responsableId = nuevoResponsableId;
    incidente.version += 1;
  }

  cambiarEstado(incidenteId: string, estado: EstadoIncidente): void {
    const incidente = this.exigirIncidente(incidenteId);
    incidente.estado = estado;
    incidente.version += 1;
  }

  /** Simula el uso de HU-42: anexa sin autorizar (el tipo 'cierre' está permitido, uno por incidente). */
  anexarInterna(
    incidenteId: string,
    autorId: string,
    tipo: TipoEntradaBitacora,
    texto: string,
    operacionId: string,
  ): EntradaBitacora {
    this.exigirIncidente(incidenteId);
    // Como treksafe_entrada_bitacora_repetida (019): un UUID ya usado (HU-42 lo reutiliza como comando).
    if (this.entradas.some((f) => f.operacionId === operacionId) || this.operacionesDeOtroTipo.has(operacionId)) {
      throw new ErrorBitacoraIncidente('OPERACION_YA_REGISTRADA');
    }
    if (tipo === 'cierre' && this.entradas.some((f) => f.entrada.incidenteId === incidenteId && f.entrada.tipo === 'cierre')) {
      throw new ErrorBitacoraIncidente('OPERACION_YA_REGISTRADA');
    }
    return this.insertar(incidenteId, autorId, tipo, texto.trim(), null, operacionId);
  }

  async listar(incidenteId: string): Promise<BitacoraIncidente | null> {
    const incidente = this.incidentes.get(incidenteId);
    if (!incidente) return null;
    const entradas = this.entradas
      .filter((f) => f.entrada.incidenteId === incidenteId)
      .sort(
        (a, b) =>
          Date.parse(a.entrada.registradaEn) - Date.parse(b.entrada.registradaEn) || a.secuencia - b.secuencia,
      )
      .map((f) => Object.freeze({ ...f.entrada }));
    return Object.freeze({
      incidente: Object.freeze({
        id: incidente.id,
        expedicionId: incidente.expedicionId,
        estado: incidente.estado,
        version: incidente.version,
        responsableId: incidente.responsableId,
        nombreResponsable: this.nombreDe(incidente.responsableId),
      }),
      entradas: Object.freeze(entradas),
    });
  }

  async agregar(solicitud: SolicitudEntradaBitacora): Promise<ResultadoEntradaBitacora> {
    this.llamadasAgregar += 1;
    const anterior = this.colas.get(solicitud.incidenteId) ?? Promise.resolve();
    const actual = anterior.catch(() => undefined).then(() => this.agregarBloqueado(solicitud));
    this.colas.set(solicitud.incidenteId, actual);
    return actual;
  }

  private async agregarBloqueado(s: SolicitudEntradaBitacora): Promise<ResultadoEntradaBitacora> {
    await Promise.resolve(); // cede el turno: sin la cola, dos llamadas se entrelazarían aquí

    const texto = s.texto.trim();
    if (texto.length < 1 || texto.length > LIMITE_TEXTO_ENTRADA_BITACORA) {
      throw new ErrorBitacoraIncidente('DATOS_INVALIDOS');
    }
    const tipo: TipoEntradaBitacora = s.corrigeEntradaId === null ? 'nota' : 'correccion';

    // Repetición: se resuelve antes de autorizar (el reintento sobrevive a un relevo o cierre).
    const registrada = this.entradas.find((f) => f.operacionId === s.operacionId);
    if (registrada) {
      const e = registrada.entrada;
      if (
        e.incidenteId === s.incidenteId &&
        e.autorId === s.autorId &&
        e.tipo === tipo &&
        e.texto === texto &&
        e.corrigeEntradaId === s.corrigeEntradaId
      ) {
        return { entrada: Object.freeze({ ...e }), repetido: true };
      }
      throw new ErrorBitacoraIncidente('OPERACION_YA_REGISTRADA');
    }
    if (this.operacionesDeOtroTipo.has(s.operacionId)) {
      throw new ErrorBitacoraIncidente('OPERACION_YA_REGISTRADA');
    }

    const incidente = this.incidentes.get(s.incidenteId);
    if (!incidente) throw new ErrorBitacoraIncidente('INCIDENTE_NO_ENCONTRADO');
    if (incidente.estado === 'cerrado') throw new ErrorBitacoraIncidente('INCIDENTE_CERRADO');
    if (incidente.responsableId !== s.autorId) {
      throw new ErrorBitacoraIncidente('NO_ES_RESPONSABLE', {
        responsableId: incidente.responsableId,
        nombreResponsable: this.nombreDe(incidente.responsableId),
      });
    }
    if (
      s.corrigeEntradaId !== null &&
      !this.entradas.some((f) => f.entrada.id === s.corrigeEntradaId && f.entrada.incidenteId === s.incidenteId)
    ) {
      throw new ErrorBitacoraIncidente('CORRECCION_INVALIDA');
    }

    // Entre comprobar y escribir (la RPC lo hace con la fila bloqueada) se cede el turno.
    await Promise.resolve();

    const entrada = this.insertar(s.incidenteId, s.autorId, tipo, texto, s.corrigeEntradaId, s.operacionId);
    return { entrada, repetido: false };
  }

  private insertar(
    incidenteId: string,
    autorId: string,
    tipo: TipoEntradaBitacora,
    texto: string,
    corrigeEntradaId: string | null,
    operacionId: string,
  ): EntradaBitacora {
    // Hora monótona del "servidor": nunca decrece ni se repite.
    this.ultimaHora = Math.max(Date.now(), this.ultimaHora + 1);
    const entrada: EntradaBitacora = Object.freeze({
      id: randomUUID(),
      incidenteId,
      tipo,
      texto,
      autorId,
      nombreAutor: this.nombreDe(autorId),
      registradaEn: new Date(this.ultimaHora).toISOString(),
      corrigeEntradaId,
    });
    this.entradas.push({ entrada, secuencia: this.siguienteSecuencia, operacionId });
    this.siguienteSecuencia += 1;
    return entrada;
  }

  private exigirIncidente(id: string): FilaIncidente {
    const incidente = this.incidentes.get(id);
    if (!incidente) throw new Error(`Incidente no sembrado: ${id}`);
    return incidente;
  }

  private nombreDe(rescatistaId: string): string {
    return this.rescatistas.get(rescatistaId) ?? 'Rescatista';
  }
}
