import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorCierreIncidente,
  type CodigoErrorCierreIncidente,
} from '../../domain/errors/ErrorCierreIncidente.js';
import type { ResponsableVigente } from '../../domain/errors/ErrorCoordinacion.js';
import type {
  ICierreIncidenteDAO,
  InformeCierre,
  ResultadoLocalizacion,
  ResultadoRegistroCierre,
  SolicitudCierreIncidente,
  SolicitudLocalizacionIncidente,
} from '../../domain/repositories/ICierreIncidenteDAO.js';
import type { EstadoIncidente } from '../../domain/repositories/IIncidenteDAO.js';
import { RESULTADOS_RESCATE, type ResultadoRescate } from '../../domain/value-objects/cierreIncidente.js';
import type { EstadoExpedicion } from '../../domain/value-objects/enums.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Códigos de negocio que lanzan las RPC de la 025 en `error.message`. */
const CODIGOS_RPC = new Set<string>([
  'DATOS_INVALIDOS',
  'INCIDENTE_NO_ENCONTRADO',
  'NO_ES_RESPONSABLE',
  'INCIDENTE_NO_LOCALIZADO',
  'INCIDENTE_CERRADO',
  'OPERACION_YA_REGISTRADA',
] satisfies CodigoErrorCierreIncidente[]);

const ESTADOS_INCIDENTE = new Set<string>(['abierto', 'localizado', 'cerrado'] satisfies EstadoIncidente[]);
const ESTADOS_EXPEDICION = new Set<string>([
  'programada', 'en_progreso', 'completada', 'alerta', 'cancelada',
] satisfies EstadoExpedicion[]);
const RESULTADOS = new Set<string>(RESULTADOS_RESCATE);

/**
 * Error inesperado: nunca expone el mensaje de la base al cliente y nunca es 401.
 * Privacidad: solo se registra `error.message`; jamás `details` (una violación de CHECK
 * trae la fila, y en ella el resumen), la solicitud ni el resumen.
 */
function errorInterno(contexto: string, causa: { message: string }): ErrorAplicacion {
  console.error(`[CierreIncidenteDAOSupabase] ${contexto}:`, causa.message);
  return new ErrorAplicacion(500, 'No se pudo completar la operación de cierre');
}

const esTexto = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0;
const esFechaValida = (valor: unknown): valor is string => typeof valor === 'string' && !Number.isNaN(Date.parse(valor));

/** `DETAIL` de NO_ES_RESPONSABLE: JSON `{id, nombreCompleto}` → `{responsableId, nombreResponsable}`. */
function leerResponsableVigente(detalle: unknown): ResponsableVigente | null {
  if (typeof detalle !== 'string') return null;
  try {
    const valor: unknown = JSON.parse(detalle);
    if (typeof valor !== 'object' || valor === null) return null;
    const { id, nombreCompleto } = valor as Record<string, unknown>;
    if (!esTexto(id) || typeof nombreCompleto !== 'string') return null;
    return { responsableId: id, nombreResponsable: nombreCompleto };
  } catch {
    return null;
  }
}

/** Resultado JSON del informe → `InformeCierre`, con `cerradoEn` normalizada a ISO en UTC. */
function leerInforme(datos: unknown): (InformeCierre & { repetido: boolean }) | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  const autor = d.cerradoPor as Record<string, unknown> | null | undefined;
  if (
    !esTexto(d.id) ||
    !esTexto(d.incidenteId) ||
    !esTexto(d.expedicionId) ||
    typeof d.resultado !== 'string' ||
    !RESULTADOS.has(d.resultado) ||
    typeof d.resumen !== 'string' ||
    typeof autor !== 'object' ||
    autor === null ||
    !esTexto(autor.id) ||
    typeof autor.nombreCompleto !== 'string' ||
    !esFechaValida(d.cerradoEn) ||
    !esTexto(d.entradaBitacoraId) ||
    typeof d.estadoExpedicion !== 'string' ||
    !ESTADOS_EXPEDICION.has(d.estadoExpedicion) ||
    typeof d.repetido !== 'boolean'
  ) {
    return null;
  }
  return Object.freeze({
    id: d.id,
    incidenteId: d.incidenteId,
    expedicionId: d.expedicionId,
    resultado: d.resultado as ResultadoRescate,
    resumen: d.resumen,
    cerradoPorId: autor.id,
    nombreCerradoPor: autor.nombreCompleto,
    cerradoEn: new Date(d.cerradoEn).toISOString(),
    entradaBitacoraId: d.entradaBitacoraId,
    estadoExpedicion: d.estadoExpedicion as EstadoExpedicion,
    repetido: d.repetido,
  });
}

/** Resultado de `treksafe_resultado_coordinacion` (017) tras marcar la persona localizada. */
function leerLocalizacion(datos: unknown): ResultadoLocalizacion | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  const responsable = d.responsable as Record<string, unknown> | null | undefined;
  if (
    !esTexto(d.id) ||
    !esTexto(d.expedicionId) ||
    typeof d.estado !== 'string' ||
    !ESTADOS_INCIDENTE.has(d.estado) ||
    typeof d.version !== 'number' ||
    typeof responsable !== 'object' ||
    responsable === null ||
    !esTexto(responsable.id) ||
    typeof responsable.nombreCompleto !== 'string' ||
    typeof d.repetido !== 'boolean'
  ) {
    return null;
  }
  return {
    incidente: Object.freeze({
      id: d.id,
      expedicionId: d.expedicionId,
      estado: d.estado as EstadoIncidente,
      version: d.version,
      responsableId: responsable.id,
      nombreResponsable: responsable.nombreCompleto,
    }),
    repetido: d.repetido,
  };
}

type ErrorRpc = { message: string; details?: unknown };

export class CierreIncidenteDAOSupabase implements ICierreIncidenteDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'rpc'>) {}

  /** Traduce el error de una RPC de escritura: negocio → `ErrorCierreIncidente`; lo demás → 500. */
  private traducir(contexto: string, error: ErrorRpc): Error {
    if (CODIGOS_RPC.has(error.message)) {
      const codigo = error.message as CodigoErrorCierreIncidente;
      if (codigo !== 'NO_ES_RESPONSABLE') return new ErrorCierreIncidente(codigo);
      const vigente = leerResponsableVigente(error.details);
      if (!vigente) return errorInterno(contexto, { message: 'DETAIL de NO_ES_RESPONSABLE mal formado' });
      return new ErrorCierreIncidente(codigo, vigente);
    }
    return errorInterno(contexto, error);
  }

  async cerrar(s: SolicitudCierreIncidente): Promise<ResultadoRegistroCierre> {
    const { data, error } = await this.cliente.rpc('treksafe_cerrar_incidente', {
      p_incidente_id: s.incidenteId,
      p_rescatista_id: s.rescatistaId,
      p_resultado: s.resultado,
      p_resumen: s.resumen,
      p_comando_id: s.comandoId,
    });
    if (error) throw this.traducir('cerrar', error);

    const leido = leerInforme(data);
    if (!leido) throw errorInterno('cerrar', { message: 'Respuesta de la RPC con forma inesperada' });
    const { repetido, ...informe } = leido;
    return { informe, repetido };
  }

  async marcarLocalizado(s: SolicitudLocalizacionIncidente): Promise<ResultadoLocalizacion> {
    const { data, error } = await this.cliente.rpc('treksafe_marcar_incidente_localizado', {
      p_incidente_id: s.incidenteId,
      p_rescatista_id: s.rescatistaId,
      p_operacion_id: s.operacionId,
    });
    if (error) throw this.traducir('marcar localizado', error);

    const resultado = leerLocalizacion(data);
    if (!resultado) throw errorInterno('marcar localizado', { message: 'Respuesta de la RPC con forma inesperada' });
    return resultado;
  }

  async ultimoCierreDeExpedicion(expedicionId: string): Promise<InformeCierre | null> {
    const { data, error } = await this.cliente.rpc('treksafe_leer_ultimo_cierre_incidente', {
      p_expedicion_id: expedicionId,
    });
    if (error) throw errorInterno('leer último cierre', error);
    if (data === null || data === undefined) return null;

    const leido = leerInforme(data);
    if (!leido) throw errorInterno('leer último cierre', { message: 'Respuesta de la RPC con forma inesperada' });
    const { repetido: _repetido, ...informe } = leido;
    return informe;
  }
}
