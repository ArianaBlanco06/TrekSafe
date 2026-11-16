import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpedicionParaRepetir, IHistorialExpedicionesDAO } from '../../domain/repositories/IHistorialExpedicionesDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

type FilaHistorial = {
  id: string;
  senderista_id: string;
  estado: string;
  lugar_inicio: string;
  lugar_fin: string;
  coordenadas_inicio: string | null;
  coordenadas_fin: string | null;
  minutos_tolerancia: number;
  vinculos_expedicion_contacto: { contacto_id: string }[];
  acompanantes_expedicion: { nombre_acompanante: string }[];
};

/** Solo lectura: selecciona los datos reutilizables y exige propiedad y estado en la consulta. */
export class HistorialExpedicionesDAOSupabase implements IHistorialExpedicionesDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from'>) {}

  async buscarPorId(senderistaId: string, expedicionId: string): Promise<ExpedicionParaRepetir | null> {
    const { data, error } = await this.cliente.from('expediciones')
      .select(`
        id, senderista_id, estado, lugar_inicio, lugar_fin,
        coordenadas_inicio, coordenadas_fin, minutos_tolerancia,
        vinculos_expedicion_contacto ( contacto_id ),
        acompanantes_expedicion ( nombre_acompanante )
      `)
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .eq('estado', 'completada')
      .maybeSingle();

    if (error) {
      throw new ErrorAplicacion(500, 'No se pudo consultar el historial de expediciones.', 'HISTORIAL_NO_DISPONIBLE');
    }
    if (!data) return null;

    const fila = data as unknown as FilaHistorial;
    return {
      id: fila.id,
      senderistaId: fila.senderista_id,
      estado: fila.estado,
      lugarInicio: fila.lugar_inicio,
      lugarFin: fila.lugar_fin,
      coordenadasInicio: fila.coordenadas_inicio,
      coordenadasFin: fila.coordenadas_fin,
      minutosTolerancia: fila.minutos_tolerancia,
      idsContactos: fila.vinculos_expedicion_contacto.map((vinculo) => vinculo.contacto_id),
      nombresAcompanantes: fila.acompanantes_expedicion.map((acompanante) => acompanante.nombre_acompanante),
    };
  }
}
