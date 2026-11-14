import type { SupabaseClient } from '@supabase/supabase-js';
import type { IReporteIncidentesDAO, ResumenIncidentes } from '../../domain/repositories/IReporteIncidentesDAO.js';
import type { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
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

/** El agregado y la validación del perfil se ejecutan en la RPC de lectura de HU-47. */
export class ReporteIncidentesDAOSupabase implements IReporteIncidentesDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'rpc'>) {}

  async consultar(rescatistaId: string, filtros: FiltrosReporteIncidentes): Promise<ResumenIncidentes> {
    let respuesta;
    try {
      respuesta = await this.cliente.rpc('treksafe_consultar_estadisticas_incidentes', {
        p_rescatista_id: rescatistaId,
        p_desde: filtros.desdeInclusivo,
        p_hasta_exclusivo: filtros.hastaExclusivo,
        p_criterio_fecha: filtros.criterioFecha,
        p_zona: filtros.zona,
        p_resultado: filtros.resultado,
      });
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
    return leerResumen(data);
  }
}
