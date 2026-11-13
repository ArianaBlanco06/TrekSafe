import type {
  ExpedicionLeida,
  ExpedicionActivaLeida,
  IRepositorioExpedicion,
} from '../../application/ports/RepositorioExpedicion.js';
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
  minutos_recordatorio?: number;
  estado: string;
  version: number;
  creado_en?: string;
  actualizado_en?: string;
};

type FilaExpedicionActiva = FilaExpedicion & {
  acompanantes_expedicion: { nombre_acompanante: string }[];
  vinculos_expedicion_contacto: {
    contactos_emergencia: { nombre_completo: string; correo_electronico: string } | null;
  }[];
  /** HU-35: solo el tipo, para contar las ampliaciones del retorno. */
  eventos_plan?: { tipo: string }[];
};

/** Traducción única de filas SQL a la lectura de negocio usada por los servicios. */
export function mapearExpedicionPersistida(fila: FilaExpedicion): ExpedicionLeida {
  return {
    id: fila.id,
    lugarInicio: fila.lugar_inicio,
    lugarFin: fila.lugar_fin,
    horaInicio: fila.hora_inicio,
    horaRetornoEstimada: fila.hora_retorno_estimada,
    minutosTolerancia: fila.minutos_tolerancia,
    estado: fila.estado,
    version: fila.version,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function mapearExpedicionActivaPersistida(fila: FilaExpedicionActiva): ExpedicionActivaLeida {
  return {
    ...mapearExpedicionPersistida(fila),
    acompanantes: fila.acompanantes_expedicion.map((a) => a.nombre_acompanante),
    contactos: fila.vinculos_expedicion_contacto.flatMap(
      ({ contactos_emergencia: contacto }) => contacto
        ? [{ nombreCompleto: contacto.nombre_completo, correoElectronico: contacto.correo_electronico }]
        : [],
    ),
    cantidadAmpliaciones: (fila.eventos_plan ?? []).filter(
      (evento) => evento.tipo === 'RETORNO_AMPLIADO',
    ).length,
  };
}

export class RepositorioExpedicion implements IRepositorioExpedicion {
  constructor(private readonly supabase = getSupabaseAdmin()) {}

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
      minutosRecordatorio?: number;
      estado: 'programada' | 'en_progreso';
      idsContactos: string[];
      nombresAcompanantes: string[];
    },
  ): Promise<ExpedicionLeida> {
    const coordsInicio = input.coordenadasInicio
      ? parseDecimalCoordinates(input.coordenadasInicio)?.formatted ?? null
      : null;
    const coordsFin = input.coordenadasFin
      ? parseDecimalCoordinates(input.coordenadasFin)?.formatted ?? null
      : null;

    const { data, error } = await this.supabase.rpc('treksafe_crear_expedicion', {
      p_senderista_id: senderistaId,
      p_datos: {
        ...input,
        coordenadasInicio: coordsInicio,
        coordenadasFin: coordsFin,
        minutosRecordatorio: input.minutosRecordatorio ?? 30,
      },
    });
    if (error) {
      if (error.message === 'EXPEDICION_ACTIVA_EXISTE'
        || (error.code === '23505' && error.message.includes('uq_expedicion_bloqueante_senderista'))) {
        throw new ErrorAplicacion(409,
          'Ya tienes una expedición en curso o en alerta. Confirma tu retorno antes de crear otra.',
          'EXPEDICION_ACTIVA_EXISTE');
      }
      if (error.message === 'CONTACTOS_INVALIDOS') {
        throw new ErrorAplicacion(400, 'Uno o más contactos no pertenecen al senderista', 'CONTACTOS_INVALIDOS');
      }
      if (error.message === 'HORA_INICIO_INVALIDA') {
        throw new ErrorAplicacion(400, 'La hora de salida debe ser posterior al momento actual', 'HORA_INICIO_INVALIDA');
      }
      if (error.message === 'HORA_RETORNO_INVALIDA') {
        throw new ErrorAplicacion(400, 'La hora de retorno estimada debe ser posterior al momento actual', 'HORA_RETORNO_INVALIDA');
      }
      if (error.message === 'NO_ES_SENDERISTA') {
        throw new ErrorAplicacion(403, 'Solo un senderista puede crear una expedición', 'PROHIBIDO');
      }
      if (error.message === 'DATOS_INVALIDOS') {
        throw new ErrorAplicacion(400, 'Datos de expedición inválidos', 'DATOS_INVALIDOS');
      }
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new ErrorAplicacion(500, 'La base de datos requiere la migración de creación transaccional');
      }
      throw new ErrorAplicacion(500, 'No se pudo crear la expedición');
    }
    if (!data || typeof data !== 'object' || !('id' in data)) {
      throw new ErrorAplicacion(500, 'Respuesta inválida al crear la expedición');
    }
    return mapearExpedicionPersistida(data as FilaExpedicion);
  }

  async listarExpedicionesCompletadas(senderistaId: string): Promise<ExpedicionLeida[]> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, version, creado_en, actualizado_en',
      )
      .eq('senderista_id', senderistaId)
      .eq('estado', 'completada')
      .order('actualizado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    return (data ?? []).map(mapearExpedicionPersistida);
  }

  async listarExpediciones(senderistaId: string): Promise<ExpedicionLeida[]> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, version, creado_en',
      )
      .eq('senderista_id', senderistaId)
      .order('creado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    return (data ?? []).map(mapearExpedicionPersistida);
  }

  async buscarActivaPorSenderista(senderistaId: string): Promise<ExpedicionActivaLeida | null> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        `
        id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada,
        minutos_tolerancia, estado, version, creado_en, actualizado_en,
        acompanantes_expedicion ( nombre_acompanante ),
        vinculos_expedicion_contacto (
          contactos_emergencia ( nombre_completo, correo_electronico )
        ),
        eventos_plan ( tipo )
      `,
      )
      .eq('senderista_id', senderistaId)
      .in('estado', ['en_progreso', 'alerta'])
      .order('actualizado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    const filas = (data ?? []) as unknown as FilaExpedicionActiva[];
    if (filas.length === 0) return null;
    const fila = filas.find((r) => r.estado === 'alerta') ?? filas[0];
    return fila ? mapearExpedicionActivaPersistida(fila) : null;
  }

  async buscarPorIdParaSenderista(expedicionId: string, senderistaId: string): Promise<ExpedicionLeida | null> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, version, actualizado_en',
      )
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    return data ? mapearExpedicionPersistida(data) : null;
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
        .lte('hora_inicio', ahora)
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

    // Fallback si la función RPC no está migrada aún. Se registra para que no pase inadvertido.
    console.error(
      '[RepositorioExpedicion] treksafe_marcar_expiradas_en_progreso_como_alerta falló; se usa la alternativa:',
      error?.message ?? 'respuesta inesperada',
    );
    const ahoraMs = Date.now();
    const ahoraIso = new Date().toISOString();

    const { data: filas, error: errorConsulta } = await this.supabase
      .from('expediciones')
      .select('id, hora_retorno_estimada, minutos_tolerancia')
      .eq('estado', 'en_progreso');

    if (errorConsulta) throw new ErrorAplicacion(500, errorConsulta.message);

    const expiradas = (filas ?? []).filter(
      (fila) =>
        new Date(calcularFechaLimite(fila.hora_retorno_estimada, fila.minutos_tolerancia)).getTime() <
        ahoraMs,
    );

    // Compare-and-swap por fila (HU-35): el UPDATE exige la hora y la tolerancia leídas.
    // Si el senderista amplió el retorno entre la lectura y la escritura, la hora ya no
    // coincide y la fila no se marca: así no se genera una alerta falsa.
    const marcadas: string[] = [];
    for (const fila of expiradas) {
      const { data: actualizada, error: errorActualizar } = await this.supabase
        .from('expediciones')
        .update({ estado: 'alerta', actualizado_en: ahoraIso })
        .eq('id', fila.id)
        .eq('estado', 'en_progreso')
        .eq('hora_retorno_estimada', fila.hora_retorno_estimada)
        .eq('minutos_tolerancia', fila.minutos_tolerancia)
        .select('id')
        .maybeSingle();

      if (errorActualizar) throw new ErrorAplicacion(500, errorActualizar.message);
      if (actualizada) marcadas.push(actualizada.id);
    }
    return marcadas;
  }

  async completarConfirmacionRetorno(expedicionId: string, senderistaId: string): Promise<ExpedicionLeida> {
    const confirmadoEn = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('expediciones')
      .update({ estado: 'completada', actualizado_en: confirmadoEn })
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .in('estado', ['en_progreso', 'alerta'])
      .select(
        'id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, version, actualizado_en',
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

    return mapearExpedicionPersistida(data);
  }

  async buscarEnProgresoParaRecordatorio(): Promise<
    Array<{
      id: string;
      senderistaId: string;
      horaRetornoEstimada: string;
      minutosRecordatorio: number;
    }>
  > {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select('id, senderista_id, hora_retorno_estimada, minutos_recordatorio')
      .eq('estado', 'en_progreso');

    if (error) {
      throw new ErrorAplicacion(500, error.message);
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      senderistaId: d.senderista_id,
      horaRetornoEstimada: d.hora_retorno_estimada,
      minutosRecordatorio: d.minutos_recordatorio ?? 30,
    }));
  }
}
