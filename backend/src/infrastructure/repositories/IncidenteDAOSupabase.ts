import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorCoordinacion,
  type CodigoErrorCoordinacion,
  type CodigoErrorRelevo,
  type DetalleErrorRelevo,
  type RelevoPendientePublico,
  type ResponsableVigente,
} from '../../domain/errors/ErrorCoordinacion.js';
import type {
  Coordinacion,
  EstadoIncidente,
  EstadoRelevo,
  IIncidenteDAO,
  IRelevoDAO,
  Incidente,
  Relevo,
  ResultadoAsuncion,
  ResultadoRelevo,
  SolicitudAceptarRelevo,
  SolicitudAsuncion,
  SolicitudProponerRelevo,
} from '../../domain/repositories/IIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Códigos de negocio que lanza treksafe_asumir_coordinacion (017) en `error.message`. */
const CODIGOS_RPC = new Set<string>([
  'DATOS_INVALIDOS',
  'ALERTA_NO_ENCONTRADA',
  'NO_ES_RESCATISTA',
  'COORDINACION_YA_ASUMIDA',
] satisfies CodigoErrorCoordinacion[]);

/** Códigos de negocio que lanzan treksafe_proponer_relevo y treksafe_aceptar_relevo (019) en `error.message`. */
const CODIGOS_RELEVO = new Set<string>([
  'DATOS_INVALIDOS',
  'INCIDENTE_NO_ENCONTRADO',
  'RELEVO_NO_ENCONTRADO',
  'NO_ES_RESCATISTA',
  'INCIDENTE_CERRADO',
  'NO_ES_RESPONSABLE',
  'NO_ES_DESTINATARIO',
  'DESTINATARIO_INVALIDO',
  'DESTINATARIO_NO_VALIDADO',
  'VERSION_DESACTUALIZADA',
  'RELEVO_PENDIENTE',
  'RELEVO_YA_RESUELTO',
] satisfies CodigoErrorRelevo[]);

const ESTADOS = new Set<string>(['abierto', 'localizado', 'cerrado'] satisfies EstadoIncidente[]);
const ESTADOS_RELEVO = new Set<string>(['pendiente', 'aceptado'] satisfies EstadoRelevo[]);

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

type NombrePerfil = { nombre_completo: string } | { nombre_completo: string }[] | null;

/** Relevo embebido en la lectura de coordinaciones (solo los campos que la consola necesita). */
type FilaRelevoEmbebido = {
  id: string;
  estado: string;
  destinatario_id: string;
  responsable_anterior_id: string;
  solicitado_en: string;
  motivo: string;
  perfiles_rescatista: NombrePerfil;
};

type FilaCoordinacion = {
  id: string;
  expedicion_id: string;
  version: number;
  responsable_id: string;
  asumido_en: string;
  perfiles_rescatista: NombrePerfil;
  relevos_coordinacion?: FilaRelevoEmbebido[] | null;
};

const nombreDe = (perfil: NombrePerfil | undefined): string | undefined =>
  (Array.isArray(perfil) ? perfil[0] : perfil)?.nombre_completo;

/** `DETAIL` de VERSION_DESACTUALIZADA: `{versionActual}`. */
function leerVersionActual(detalle: unknown): DetalleErrorRelevo | null {
  if (typeof detalle !== 'string') return null;
  try {
    const valor: unknown = JSON.parse(detalle);
    const versionActual = (valor as { versionActual?: unknown } | null)?.versionActual;
    return typeof versionActual === 'number' ? { versionActual } : null;
  } catch {
    return null;
  }
}

/** `DETAIL` de RELEVO_PENDIENTE: el relevo sin motivo (`treksafe_relevo_publico`). */
function leerRelevoPendiente(detalle: unknown): DetalleErrorRelevo | null {
  if (typeof detalle !== 'string') return null;
  try {
    const v = JSON.parse(detalle) as Record<string, unknown> | null;
    if (
      typeof v !== 'object' ||
      v === null ||
      !esTexto(v.relevoId) ||
      !esTexto(v.destinatarioId) ||
      typeof v.nombreDestinatario !== 'string' ||
      typeof v.solicitadoEn !== 'string' ||
      Number.isNaN(Date.parse(v.solicitadoEn))
    ) {
      return null;
    }
    const relevoPendiente: RelevoPendientePublico = {
      relevoId: v.relevoId,
      destinatarioId: v.destinatarioId,
      nombreDestinatario: v.nombreDestinatario,
      solicitadoEn: new Date(v.solicitadoEn).toISOString(),
    };
    return { relevoPendiente };
  } catch {
    return null;
  }
}

const personaValida = (valor: unknown): valor is { id: string; nombreCompleto: string } =>
  typeof valor === 'object' &&
  valor !== null &&
  esTexto((valor as Record<string, unknown>).id) &&
  typeof (valor as Record<string, unknown>).nombreCompleto === 'string';

/** Resultado JSON de proponer o aceptar: la coordinación de HU-39 más `relevo`. */
function leerResultadoRelevo(datos: unknown): ResultadoRelevo | null {
  const base = leerResultado(datos);
  if (!base) return null;
  const r = (datos as { relevo?: unknown }).relevo as Record<string, unknown> | null | undefined;
  if (
    typeof r !== 'object' ||
    r === null ||
    !esTexto(r.id) ||
    typeof r.estado !== 'string' ||
    !ESTADOS_RELEVO.has(r.estado) ||
    !personaValida(r.responsableAnterior) ||
    !personaValida(r.destinatario) ||
    typeof r.motivo !== 'string' ||
    typeof r.solicitadoEn !== 'string' ||
    Number.isNaN(Date.parse(r.solicitadoEn)) ||
    !(r.resueltoEn === null || (typeof r.resueltoEn === 'string' && !Number.isNaN(Date.parse(r.resueltoEn)))) ||
    typeof r.versionIncidente !== 'number'
  ) {
    return null;
  }
  const relevo: Relevo = {
    id: r.id,
    estado: r.estado as EstadoRelevo,
    responsableAnteriorId: r.responsableAnterior.id,
    nombreResponsableAnterior: r.responsableAnterior.nombreCompleto,
    destinatarioId: r.destinatario.id,
    nombreDestinatario: r.destinatario.nombreCompleto,
    motivo: r.motivo,
    solicitadoEn: new Date(r.solicitadoEn).toISOString(),
    resueltoEn: r.resueltoEn === null ? null : new Date(r.resueltoEn as string).toISOString(),
    versionIncidente: r.versionIncidente,
  };
  return { incidente: base.incidente, relevo, repetido: base.repetido };
}

export class IncidenteDAOSupabase implements IIncidenteDAO, IRelevoDAO {
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

    // Columnas explícitas: la consola solo conoce al responsable y al relevo, nunca datos
    // médicos. Los relevos van embebidos (una sola consulta, sin N+1). La tabla de relevos
    // tiene dos claves foráneas a perfiles_rescatista, por eso el embebido del destinatario
    // lleva la pista fk_relevos_destinatario.
    const { data, error } = await this.cliente
      .from('incidentes')
      .select(
        'id, expedicion_id, version, responsable_id, asumido_en, perfiles_rescatista ( nombre_completo ), ' +
          'relevos_coordinacion ( id, estado, destinatario_id, responsable_anterior_id, solicitado_en, motivo, ' +
          'perfiles_rescatista!fk_relevos_destinatario ( nombre_completo ) )',
      )
      .in('expedicion_id', ids)
      .neq('estado', 'cerrado');

    if (error) throw errorInterno('leerCoordinaciones', error);

    for (const fila of (data ?? []) as unknown as FilaCoordinacion[]) {
      const coordinacion: Coordinacion = {
        incidenteId: fila.id,
        version: fila.version,
        responsableId: fila.responsable_id,
        nombreResponsable: nombreDe(fila.perfiles_rescatista) ?? 'Rescatista',
        asumidoEn: new Date(fila.asumido_en).toISOString(),
        esMia: fila.responsable_id === rescatistaId,
      };
      // La clave solo existe con un relevo pendiente: sin él, la forma es la de HU-39.
      const pendiente = (fila.relevos_coordinacion ?? []).find((r) => r.estado === 'pendiente');
      if (pendiente) {
        const esParaMi = pendiente.destinatario_id === rescatistaId;
        coordinacion.relevoPendiente = {
          relevoId: pendiente.id,
          destinatarioId: pendiente.destinatario_id,
          nombreDestinatario: nombreDe(pendiente.perfiles_rescatista) ?? 'Rescatista',
          solicitadoEn: new Date(pendiente.solicitado_en).toISOString(),
          esParaMi,
          // El motivo es texto libre: solo lo ven las dos partes del relevo.
          ...(esParaMi || pendiente.responsable_anterior_id === rescatistaId ? { motivo: pendiente.motivo } : {}),
        };
      }
      coordinaciones.set(fila.expedicion_id, coordinacion);
    }
    return coordinaciones;
  }

  async proponerRelevo(solicitud: SolicitudProponerRelevo): Promise<ResultadoRelevo> {
    return this.invocarRelevo('proponerRelevo', 'treksafe_proponer_relevo', {
      p_expedicion_id: solicitud.expedicionId,
      p_actor_id: solicitud.rescatistaId,
      p_destinatario_id: solicitud.destinatarioId,
      p_motivo: solicitud.motivo,
      p_version_incidente: solicitud.versionIncidente,
      p_operacion_id: solicitud.operacionId,
    });
  }

  async aceptarRelevo(solicitud: SolicitudAceptarRelevo): Promise<ResultadoRelevo> {
    return this.invocarRelevo('aceptarRelevo', 'treksafe_aceptar_relevo', {
      p_expedicion_id: solicitud.expedicionId,
      p_actor_id: solicitud.rescatistaId,
      p_relevo_id: solicitud.relevoId,
      p_operacion_id: solicitud.operacionId,
    });
  }

  /** Llama a la RPC, traduce sus códigos de negocio a `ErrorCoordinacion` y valida el resultado. */
  private async invocarRelevo(
    contexto: string,
    rpc: string,
    parametros: Record<string, unknown>,
  ): Promise<ResultadoRelevo> {
    const { data, error } = await this.cliente.rpc(rpc, parametros);

    if (error) {
      if (!CODIGOS_RELEVO.has(error.message)) throw errorInterno(contexto, error);
      const codigo = error.message as CodigoErrorRelevo;
      if (codigo === 'VERSION_DESACTUALIZADA' || codigo === 'RELEVO_PENDIENTE') {
        const detalle =
          codigo === 'VERSION_DESACTUALIZADA'
            ? leerVersionActual(error.details)
            : leerRelevoPendiente(error.details);
        if (!detalle) throw errorInterno(contexto, { message: `DETAIL de ${codigo} mal formado` });
        throw new ErrorCoordinacion<CodigoErrorRelevo>(codigo, undefined, detalle);
      }
      throw new ErrorCoordinacion<CodigoErrorRelevo>(codigo);
    }

    const resultado = leerResultadoRelevo(data);
    if (!resultado) throw errorInterno(contexto, { message: 'Respuesta de la RPC con forma inesperada' });
    return resultado;
  }
}
