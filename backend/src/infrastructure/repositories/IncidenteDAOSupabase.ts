import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorCoordinacion,
  type CodigoErrorCoordinacion,
  type ResponsableVigente,
} from '../../domain/errors/ErrorCoordinacion.js';
import type {
  Coordinacion,
  EstadoIncidente,
  IIncidenteDAO,
  Incidente,
  ResultadoAsuncion,
  SolicitudAsuncion,
} from '../../domain/repositories/IIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Códigos de negocio que lanza treksafe_asumir_coordinacion (017) en `error.message`. */
const CODIGOS_RPC = new Set<string>([
  'DATOS_INVALIDOS',
  'ALERTA_NO_ENCONTRADA',
  'NO_ES_RESCATISTA',
  'COORDINACION_YA_ASUMIDA',
] satisfies CodigoErrorCoordinacion[]);

const ESTADOS = new Set<string>(['abierto', 'localizado', 'cerrado'] satisfies EstadoIncidente[]);

/** Error inesperado: nunca expone el mensaje de la base al cliente y nunca es 401. */
function errorInterno(contexto: string, causa: { message: string }): ErrorAplicacion {
  console.error(`[IncidenteDAOSupabase] ${contexto}:`, causa.message);
  return new ErrorAplicacion(500, 'No se pudo completar la operación de coordinación');
}

const esTexto = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0;

/** `DETAIL` de COORDINACION_YA_ASUMIDA: JSON `{id, nombreCompleto}` → `{responsableId, nombreResponsable}`. */
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

/** Resultado JSON de la RPC → `ResultadoAsuncion`, con `asumidoEn` normalizado a ISO en UTC. */
function leerResultado(datos: unknown): ResultadoAsuncion | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const d = datos as Record<string, unknown>;
  const responsable = d.responsable as Record<string, unknown> | null | undefined;
  if (
    !esTexto(d.id) ||
    !esTexto(d.expedicionId) ||
    typeof d.estado !== 'string' ||
    !ESTADOS.has(d.estado) ||
    typeof d.version !== 'number' ||
    typeof responsable !== 'object' ||
    responsable === null ||
    !esTexto(responsable.id) ||
    typeof responsable.nombreCompleto !== 'string' ||
    typeof d.asumidoEn !== 'string' ||
    Number.isNaN(Date.parse(d.asumidoEn)) ||
    typeof d.repetido !== 'boolean'
  ) {
    return null;
  }
  return {
    incidente: {
      id: d.id,
      expedicionId: d.expedicionId,
      estado: d.estado as EstadoIncidente,
      version: d.version,
      responsableId: responsable.id,
      nombreResponsable: responsable.nombreCompleto,
      asumidoEn: new Date(d.asumidoEn).toISOString(),
    } satisfies Incidente,
    repetido: d.repetido,
  };
}

type FilaCoordinacion = {
  id: string;
  expedicion_id: string;
  version: number;
  responsable_id: string;
  asumido_en: string;
  perfiles_rescatista: { nombre_completo: string } | { nombre_completo: string }[] | null;
};

export class IncidenteDAOSupabase implements IIncidenteDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from' | 'rpc'>) {}

  async asumir(solicitud: SolicitudAsuncion): Promise<ResultadoAsuncion> {
    const { data, error } = await this.cliente.rpc('treksafe_asumir_coordinacion', {
      p_expedicion_id: solicitud.expedicionId,
      p_rescatista_id: solicitud.rescatistaId,
      p_operacion_id: solicitud.operacionId,
    });

    if (error) {
      if (CODIGOS_RPC.has(error.message)) {
        const codigo = error.message as CodigoErrorCoordinacion;
        if (codigo !== 'COORDINACION_YA_ASUMIDA') throw new ErrorCoordinacion(codigo);
        const vigente = leerResponsableVigente(error.details);
        if (!vigente) {
          throw errorInterno('asumir', { message: 'DETAIL de COORDINACION_YA_ASUMIDA mal formado' });
        }
        throw new ErrorCoordinacion(codigo, vigente);
      }
      throw errorInterno('asumir', error);
    }

    const resultado = leerResultado(data);
    if (!resultado) throw errorInterno('asumir', { message: 'Respuesta de la RPC con forma inesperada' });
    return resultado;
  }

  async leerCoordinaciones(
    expedicionIds: readonly string[],
    rescatistaId: string,
  ): Promise<Map<string, Coordinacion>> {
    const ids = [...new Set(expedicionIds)];
    const coordinaciones = new Map<string, Coordinacion>();
    if (ids.length === 0) return coordinaciones;

    // Columnas explícitas: la consola solo conoce al responsable, nunca datos médicos.
    const { data, error } = await this.cliente
      .from('incidentes')
      .select('id, expedicion_id, version, responsable_id, asumido_en, perfiles_rescatista ( nombre_completo )')
      .in('expedicion_id', ids)
      .neq('estado', 'cerrado');

    if (error) throw errorInterno('leerCoordinaciones', error);

    for (const fila of (data ?? []) as unknown as FilaCoordinacion[]) {
      const perfil = Array.isArray(fila.perfiles_rescatista)
        ? fila.perfiles_rescatista[0]
        : fila.perfiles_rescatista;
      coordinaciones.set(fila.expedicion_id, {
        incidenteId: fila.id,
        version: fila.version,
        responsableId: fila.responsable_id,
        nombreResponsable: perfil?.nombre_completo ?? 'Rescatista',
        asumidoEn: new Date(fila.asumido_en).toISOString(),
        esMia: fila.responsable_id === rescatistaId,
      });
    }
    return coordinaciones;
  }
}
