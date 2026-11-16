import type { SupabaseClient } from '@supabase/supabase-js';
import type { IReporteIncidentesDAO, ResumenIncidentes } from '../../domain/repositories/IReporteIncidentesDAO.js';
import type { ILectorPaginasReporteIncidentes, IncidenteReporte, PaginaIncidentesReporte, SolicitudPaginaIncidentes } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import type { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { RESULTADOS_RESCATE } from '../../domain/value-objects/cierreIncidente.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

const falloConsulta = () => new ErrorAplicacion(
  500, 'No se pudieron consultar las estadísticas de rescate.', 'REPORTE_NO_DISPONIBLE',
);

function leerResumen(datos: unknown): ResumenIncidentes {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) throw falloConsulta();
  const { atendidos, abiertos, cerrados } = datos as Record<string, unknown>;
  if (
    typeof atendidos !== 'number' || !Number.isSafeInteger(atendidos) || atendidos < 0 ||
    typeof abiertos !== 'number' || !Number.isSafeInteger(abiertos) || abiertos < 0 ||
    typeof cerrados !== 'number' || !Number.isSafeInteger(cerrados) || cerrados < 0 ||
    atendidos !== abiertos + cerrados
  ) throw falloConsulta();
  return Object.freeze({ atendidos, abiertos, cerrados });
}

const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function leerPagina(datos: unknown, tamano: number): PaginaIncidentesReporte {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) throw falloConsulta();
  const d = datos as Record<string, unknown>;
  if (!Array.isArray(d.incidentes) || typeof d.hayMas !== 'boolean' || d.incidentes.length > tamano ||
    (d.hayMas && d.incidentes.length === 0)) throw falloConsulta();
  const incidentes = d.incidentes.map((valor: unknown): IncidenteReporte => {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw falloConsulta();
    const f = valor as Record<string, unknown>;
    if (typeof f.id !== 'string' || !UUID_CANONICO.test(f.id) || typeof f.zona !== 'string' ||
      typeof f.abiertoEn !== 'string' || !Number.isFinite(Date.parse(f.abiertoEn)) ||
      (f.cerradoEn !== null && (typeof f.cerradoEn !== 'string' || !Number.isFinite(Date.parse(f.cerradoEn)))) ||
      typeof f.estado !== 'string' || !['abierto', 'localizado', 'cerrado'].includes(f.estado) ||
      (f.resultado !== null && !RESULTADOS_RESCATE.some(r => r === f.resultado)) ||
      ((f.estado === 'cerrado') !== (f.cerradoEn !== null)) ||
      (f.resultado !== null && f.estado !== 'cerrado')) throw falloConsulta();
    return Object.freeze({
      id: f.id, zona: f.zona, abiertoEn: new Date(f.abiertoEn).toISOString(),
      cerradoEn: f.cerradoEn === null ? null : new Date(f.cerradoEn as string).toISOString(),
      estado: f.estado as IncidenteReporte['estado'], resultado: f.resultado as IncidenteReporte['resultado'],
    });
  });
  return Object.freeze({ incidentes: Object.freeze(incidentes), hayMas: d.hayMas });
}

function parametrosReporte(rescatistaId: string, filtros: FiltrosReporteIncidentes) {
  return {
    p_rescatista_id: rescatistaId, p_desde: filtros.desdeInclusivo,
    p_hasta_exclusivo: filtros.hastaExclusivo, p_criterio_fecha: filtros.criterioFecha,
    p_zona: filtros.zona, p_resultado: filtros.resultado,
  };
}

/** El agregado y la validación del perfil se ejecutan en la RPC de lectura de HU-47. */
export class ReporteIncidentesDAOSupabase implements IReporteIncidentesDAO, ILectorPaginasReporteIncidentes {
  constructor(private readonly cliente: Pick<SupabaseClient, 'rpc'>) {}

  private async ejecutarRpc(nombre: string, parametros: Record<string, unknown>): Promise<unknown> {
    let respuesta;
    try {
      respuesta = await this.cliente.rpc(nombre, parametros);
    } catch {
      throw falloConsulta();
    }
    const { data, error } = respuesta;
    if (error) {
      if (error.code === '42501' && error.message === 'RESCATISTA_NO_VALIDADO') {
        throw new ErrorAplicacion(403, 'Se requiere un perfil de rescatista validado.', 'RESCATISTA_NO_VALIDADO');
      }
      // No se propagan mensajes, detalles SQL, parámetros ni datos personales.
      throw falloConsulta();
    }
    return data;
  }

  async consultar(rescatistaId: string, filtros: FiltrosReporteIncidentes): Promise<ResumenIncidentes> {
    return leerResumen(await this.ejecutarRpc('treksafe_consultar_estadisticas_incidentes', parametrosReporte(rescatistaId, filtros)));
  }

  async leerPagina(actor: string, filtros: FiltrosReporteIncidentes, pagina: SolicitudPaginaIncidentes): Promise<PaginaIncidentesReporte> {
    if (!Number.isInteger(pagina.tamano) || pagina.tamano < 1 || pagina.tamano > 500 ||
      (pagina.despuesDe !== null && !UUID_CANONICO.test(pagina.despuesDe))) throw falloConsulta();
    return leerPagina(await this.ejecutarRpc('treksafe_leer_pagina_incidentes_reporte', {
      ...parametrosReporte(actor, filtros), p_despues_de: pagina.despuesDe, p_limite: pagina.tamano,
    }), pagina.tamano);
  }
}
