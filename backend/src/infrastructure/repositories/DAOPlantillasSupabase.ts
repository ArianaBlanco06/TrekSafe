import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlantillaRuta } from '../../domain/entities/PlantillaRuta.js';
import type {
  DatosPlantilla,
  IPlantillaDAO,
  ResultadoCrearPlantilla,
  ResultadoRenombrarPlantilla,
} from '../../domain/repositories/IPlantillaDAO.js';
import { getSupabaseAdmin } from '../database/supabase.js';

const COLUMNAS =
  'id, senderista_id, nombre, lugar_inicio, lugar_fin, coordenadas_inicio, coordenadas_fin, minutos_tolerancia, ids_contactos, nombres_acompanantes, version, creado_en, actualizado_en';

const PG_VIOLACION_UNICIDAD = '23505';

type FilaPlantilla = {
  id: string;
  senderista_id: string;
  nombre: string;
  lugar_inicio: string;
  lugar_fin: string;
  coordenadas_inicio: string | null;
  coordenadas_fin: string | null;
  minutos_tolerancia: number;
  ids_contactos: string[];
  nombres_acompanantes: string[];
  version: number;
  creado_en: string;
  actualizado_en: string;
};

function mapear(fila: FilaPlantilla): PlantillaRuta {
  return {
    id: fila.id,
    senderistaId: fila.senderista_id,
    nombre: fila.nombre,
    lugarInicio: fila.lugar_inicio,
    lugarFin: fila.lugar_fin,
    coordenadasInicio: fila.coordenadas_inicio,
    coordenadasFin: fila.coordenadas_fin,
    minutosTolerancia: fila.minutos_tolerancia,
    idsContactos: fila.ids_contactos ?? [],
    nombresAcompanantes: fila.nombres_acompanantes ?? [],
    version: fila.version,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export class DAOPlantillasSupabase implements IPlantillaDAO {
  constructor(private readonly supabase: SupabaseClient = getSupabaseAdmin()) {}

  async listarPorPropietario(senderistaId: string): Promise<PlantillaRuta[]> {
    const { data, error } = await this.supabase
      .from('plantillas_ruta')
      .select(COLUMNAS)
      .eq('senderista_id', senderistaId)
      .order('actualizado_en', { ascending: false })
      .order('id', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as FilaPlantilla[]).map(mapear);
  }

  async buscarPorId(senderistaId: string, plantillaId: string): Promise<PlantillaRuta | null> {
    const { data, error } = await this.supabase
      .from('plantillas_ruta')
      .select(COLUMNAS)
      .eq('id', plantillaId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapear(data as FilaPlantilla) : null;
  }

  async crear(senderistaId: string, datos: DatosPlantilla): Promise<ResultadoCrearPlantilla> {
    const { data, error } = await this.supabase
      .from('plantillas_ruta')
      .insert({
        senderista_id: senderistaId,
        nombre: datos.nombre,
        lugar_inicio: datos.lugarInicio,
        lugar_fin: datos.lugarFin,
        coordenadas_inicio: datos.coordenadasInicio,
        coordenadas_fin: datos.coordenadasFin,
        minutos_tolerancia: datos.minutosTolerancia,
        ids_contactos: datos.idsContactos,
        nombres_acompanantes: datos.nombresAcompanantes,
      })
      .select(COLUMNAS)
      .single();

    if (error?.code === PG_VIOLACION_UNICIDAD) return { tipo: 'nombre_duplicado' };
    if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la plantilla');
    return { tipo: 'ok', plantilla: mapear(data as FilaPlantilla) };
  }

  async renombrar(
    senderistaId: string,
    plantillaId: string,
    nombre: string,
    versionEsperada: number,
  ): Promise<ResultadoRenombrarPlantilla> {
    // Compare-and-swap: el trigger de la tabla incrementa la versión y fija la hora del servidor.
    const { data, error } = await this.supabase
      .from('plantillas_ruta')
      .update({ nombre })
      .eq('id', plantillaId)
      .eq('senderista_id', senderistaId)
      .eq('version', versionEsperada)
      .select(COLUMNAS)
      .maybeSingle();

    if (error?.code === PG_VIOLACION_UNICIDAD) return { tipo: 'nombre_duplicado' };
    if (error) throw new Error(error.message);
    if (data) return { tipo: 'ok', plantilla: mapear(data as FilaPlantilla) };

    const actual = await this.buscarPorId(senderistaId, plantillaId);
    if (!actual) return { tipo: 'no_encontrada' };
    return { tipo: 'version_obsoleta', versionActual: actual.version };
  }

  async eliminar(senderistaId: string, plantillaId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('plantillas_ruta')
      .delete()
      .eq('id', plantillaId)
      .eq('senderista_id', senderistaId)
      .select('id');

    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }
}
