import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { parseDecimalCoordinates } from '../../shared/utils/coordinates.js';
import { getSupabaseAdmin } from '../database/supabase.js';

// Re-exportar para uso en otros repositorios y servicios
export { calcularFechaLimite };

export type FilaExpedicion = {
  id: string;
  lugar_inicio: string;
  lugar_fin: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  estado: string;
  creado_en?: string;
  actualizado_en?: string;
};

type FilaExpedicionActiva = FilaExpedicion & {
  acompanantes_expedicion: { nombre_acompanante: string }[];
  vinculos_expedicion_contacto: {
    contactos_emergencia: { nombre_completo: string; correo_electronico: string } | null;
  }[];
};

export class RepositorioExpedicion {
  private readonly supabase = getSupabaseAdmin();

  async tieneExpedicionBloqueante(senderistaId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select('id')
      .eq('senderista_id', senderistaId)
      .in('estado', ['en_progreso', 'alerta'])
      .limit(1);

    if (error) throw new ErrorAplicacion(500, error.message);
    return (data?.length ?? 0) > 0;
  }

  async validarPropiedadContactos(senderistaId: string, idsContactos: string[]): Promise<void> {
    if (idsContactos.length === 0) return;

    const { data, error } = await this.supabase
      .from('contactos_emergencia')
      .select('id')
      .eq('senderista_id', senderistaId)
      .in('id', idsContactos);

    if (error) throw new ErrorAplicacion(500, error.message);
    if ((data?.length ?? 0) !== idsContactos.length) {
      throw new ErrorAplicacion(400, 'Uno o más contactos no pertenecen al senderista', 'CONTACTOS_INVALIDOS');
    }
  }

  async crearExpedicion(
    senderistaId: string,
    input: {
      lugarInicio: string;
      lugarFin: string;
      coordenadasInicio?: string;
      coordenadasFin?: string;
      horaInicio: string;
      horaRetornoEstimada: string;
      minutosTolerancia: number;
      estado: 'programada' | 'en_progreso';
      idsContactos: string[];
      nombresAcompanantes: string[];
    },
  ): Promise<FilaExpedicion> {
    const coordsInicio = input.coordenadasInicio
      ? parseDecimalCoordinates(input.coordenadasInicio)?.formatted ?? null
      : null;
    const coordsFin = input.coordenadasFin
      ? parseDecimalCoordinates(input.coordenadasFin)?.formatted ?? null
      : null;

    const { data: expedicion, error } = await this.supabase
      .from('expediciones')
      .insert({
        senderista_id: senderistaId,
        lugar_inicio: input.lugarInicio,
        lugar_fin: input.lugarFin,
        coordenadas_inicio: coordsInicio,
        coordenadas_fin: coordsFin,
        hora_inicio: input.horaInicio,
        hora_retorno_estimada: input.horaRetornoEstimada,
        minutos_tolerancia: input.minutosTolerancia,
        estado: input.estado,
      })
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, creado_en',
      )
      .single();

    if (error || !expedicion) throw new ErrorAplicacion(500, error?.message ?? 'Error al crear expedición');

    const enlacesContacto = input.idsContactos.map((contactoId) => ({
      expedicion_id: expedicion.id,
      contacto_id: contactoId,
    }));

    const { error: errorEnlace } = await this.supabase
      .from('vinculos_expedicion_contacto')
      .insert(enlacesContacto);

    if (errorEnlace) {
      await this.supabase.from('expediciones').delete().eq('id', expedicion.id);
      throw new ErrorAplicacion(500, errorEnlace.message);
    }

    const acompanantes = input.nombresAcompanantes.map((nombre) => ({
      expedicion_id: expedicion.id,
      nombre_acompanante: nombre,
    }));

    const { error: errorAcompanante } = await this.supabase
      .from('acompanantes_expedicion')
      .insert(acompanantes);

    if (errorAcompanante) {
      await this.supabase.from('expediciones').delete().eq('id', expedicion.id);
      throw new ErrorAplicacion(500, errorAcompanante.message);
    }

    return expedicion;
  }

  async listarExpedicionesCompletadas(senderistaId: string): Promise<FilaExpedicion[]> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, creado_en, actualizado_en',
      )
      .eq('senderista_id', senderistaId)
      .eq('estado', 'completada')
      .order('actualizado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    return data ?? [];
  }

  async listarExpediciones(senderistaId: string): Promise<FilaExpedicion[]> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, creado_en',
      )
      .eq('senderista_id', senderistaId)
      .order('creado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    return data ?? [];
  }

  async buscarActivaPorSenderista(senderistaId: string): Promise<FilaExpedicionActiva | null> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        `
        id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada,
        minutos_tolerancia, estado, creado_en, actualizado_en,
        acompanantes_expedicion ( nombre_acompanante ),
        vinculos_expedicion_contacto (
          contactos_emergencia ( nombre_completo, correo_electronico )
        )
      `,
      )
      .eq('senderista_id', senderistaId)
      .in('estado', ['en_progreso', 'alerta'])
      .order('actualizado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    const filas = (data ?? []) as unknown as FilaExpedicionActiva[];
    if (filas.length === 0) return null;
    return filas.find((r) => r.estado === 'alerta') ?? filas[0] ?? null;
  }

  async buscarPorIdParaSenderista(expedicionId: string, senderistaId: string): Promise<FilaExpedicion | null> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, actualizado_en',
      )
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    return data;
  }

  async promoverProgramadasListas(): Promise<number> {
    const ahora = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('expediciones')
      .select('id, senderista_id')
      .eq('estado', 'programada')
      .lte('hora_inicio', ahora)
      .order('hora_inicio', { ascending: true });

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data?.length) return 0;

    const senderistasPromovidos = new Set<string>();
    let promovidas = 0;

    for (const fila of data) {
      if (senderistasPromovidos.has(fila.senderista_id)) continue;
      if (await this.tieneExpedicionBloqueante(fila.senderista_id)) continue;

      const { data: actualizada, error: errorActualizar } = await this.supabase
        .from('expediciones')
        .update({ estado: 'en_progreso', actualizado_en: ahora })
        .eq('id', fila.id)
        .eq('estado', 'programada')
        .select('id')
        .maybeSingle();

      if (errorActualizar) throw new ErrorAplicacion(500, errorActualizar.message);
      if (actualizada) {
        senderistasPromovidos.add(fila.senderista_id);
        promovidas++;
      }
    }

    return promovidas;
  }

  async marcarEnProgresoExpiradaComoAlerta(): Promise<string[]> {
    const { data, error } = await this.supabase.rpc(
      'treksafe_marcar_expiradas_en_progreso_como_alerta',
    );

    if (!error && Array.isArray(data)) {
      return data as string[];
    }

    // Fallback si la función RPC no está migrada aún
    const ahoraMs = Date.now();
    const ahoraIso = new Date().toISOString();

    const { data: filas, error: errorConsulta } = await this.supabase
      .from('expediciones')
      .select('id, hora_retorno_estimada, minutos_tolerancia')
      .eq('estado', 'en_progreso');

    if (errorConsulta) throw new ErrorAplicacion(500, errorConsulta.message);

    const idsExpirados = (filas ?? [])
      .filter(
        (fila) =>
          new Date(calcularFechaLimite(fila.hora_retorno_estimada, fila.minutos_tolerancia)).getTime() <
          ahoraMs,
      )
      .map((fila) => fila.id);

    if (idsExpirados.length === 0) return [];

    const { data: actualizadas, error: errorActualizar } = await this.supabase
      .from('expediciones')
      .update({ estado: 'alerta', actualizado_en: ahoraIso })
      .in('id', idsExpirados)
      .eq('estado', 'en_progreso')
      .select('id');

    if (errorActualizar) throw new ErrorAplicacion(500, errorActualizar.message);
    return (actualizadas ?? []).map((fila) => fila.id);
  }

  async completarConfirmacionRetorno(expedicionId: string, senderistaId: string): Promise<FilaExpedicion> {
    const confirmadoEn = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('expediciones')
      .update({ estado: 'completada', actualizado_en: confirmadoEn })
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .in('estado', ['en_progreso', 'alerta'])
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, actualizado_en',
      )
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data) {
      throw new ErrorAplicacion(
        409,
        'La expedición no está en curso o ya fue finalizada',
        'EXPEDICION_NO_ACTIVA',
      );
    }

    return data;
  }
}
