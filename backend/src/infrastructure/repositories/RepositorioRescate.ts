import type {
  ExpedicionAlertaLeida,
  ExpedicionMonitorLeida,
  BitacoraRescateLeida,
  HistorialRescatistaLeido,
  IRepositorioRescate,
} from '../../application/ports/RepositorioRescate.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin } from '../database/supabase.js';

export type DestinatarioRescatista = {
  correoElectronico: string;
  nombreCompleto: string;
};

export type FilaExpedicionAlerta = {
  id: string;
  lugar_inicio: string;
  lugar_fin: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  actualizado_en: string;
  acompanantes_expedicion?: { count: number }[];
  perfiles_senderista: { nombre_completo: string; telefono: string } | { nombre_completo: string; telefono: string }[] | null;
};

export type FilaExpedicionMonitor = FilaExpedicionAlerta & {
  estado: 'en_progreso' | 'alerta';
  coordenadas_inicio: string | null;
  coordenadas_fin: string | null;
};

export type FilaBitacoraRescate = {
  id: string;
  expedicion_id: string;
  estado_rescate: string;
  actualizado_en: string;
  notas: string | null;
};

export type FilaHistorialRescatista = {
  id: string;
  expedicion_id: string;
  estado_rescate: string;
  actualizado_en: string;
  notas: string | null;
  expediciones: {
    id: string;
    estado: string;
    lugar_inicio: string;
    lugar_fin: string;
    hora_inicio: string;
    hora_retorno_estimada: string;
    minutos_tolerancia: number;
    actualizado_en: string;
    perfiles_senderista:
      | { nombre_completo: string; telefono: string }
      | { nombre_completo: string; telefono: string }[]
      | null;
  };
};

export function mapearExpedicionAlertaPersistida(fila: FilaExpedicionAlerta): ExpedicionAlertaLeida {
  const perfil = Array.isArray(fila.perfiles_senderista)
    ? fila.perfiles_senderista[0]
    : fila.perfiles_senderista;
  return {
    id: fila.id,
    numeroParticipantes: 1 + (fila.acompanantes_expedicion?.[0]?.count ?? 0),
    lugarInicio: fila.lugar_inicio,
    lugarFin: fila.lugar_fin,
    horaInicio: fila.hora_inicio,
    horaRetornoEstimada: fila.hora_retorno_estimada,
    minutosTolerancia: fila.minutos_tolerancia,
    actualizadoEn: fila.actualizado_en,
    senderista: perfil ? { nombreCompleto: perfil.nombre_completo, telefono: perfil.telefono } : null,
  };
}

export function mapearExpedicionMonitorPersistida(fila: FilaExpedicionMonitor): ExpedicionMonitorLeida {
  return {
    ...mapearExpedicionAlertaPersistida(fila),
    estado: fila.estado,
    coordenadasInicio: fila.coordenadas_inicio,
    coordenadasFin: fila.coordenadas_fin,
  };
}

export function mapearBitacoraRescatePersistida(fila: FilaBitacoraRescate): BitacoraRescateLeida {
  return {
    id: fila.id,
    expedicionId: fila.expedicion_id,
    estadoRescate: fila.estado_rescate,
    actualizadoEn: fila.actualizado_en,
    notas: fila.notas,
  };
}

export function mapearHistorialRescatistaPersistido(fila: FilaHistorialRescatista): HistorialRescatistaLeido {
  return {
    ...mapearBitacoraRescatePersistida(fila),
    expedicion: fila.expediciones
      ? { ...mapearExpedicionAlertaPersistida(fila.expediciones), estado: fila.expediciones.estado }
      : null,
  };
}

export class RepositorioRescate implements IRepositorioRescate {
  constructor(private readonly supabase = getSupabaseAdmin()) {}

  async verificarEsRescatista(rescatistaId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('perfiles_rescatista')
      .select('usuario_id')
      .eq('usuario_id', rescatistaId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data) throw new ErrorAplicacion(403, 'Perfil de rescatista requerido', 'NO_ES_RESCATISTA');
  }

  async listarCorreosRescatistasValidados(): Promise<DestinatarioRescatista[]> {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('correo_electronico, perfiles_rescatista ( nombre_completo )')
      .eq('rol', 'rescatista');

    if (error) throw new ErrorAplicacion(500, error.message);

    const vistos = new Set<string>();
    const destinatarios: DestinatarioRescatista[] = [];

    for (const fila of data ?? []) {
      const correo = fila.correo_electronico?.toLowerCase();
      if (!correo || vistos.has(correo)) continue;

      const perfil = fila.perfiles_rescatista;
      const nombreCompleto = Array.isArray(perfil)
        ? perfil[0]?.nombre_completo
        : (perfil as { nombre_completo: string } | null)?.nombre_completo;

      vistos.add(correo);
      destinatarios.push({
        correoElectronico: correo,
        nombreCompleto: nombreCompleto ?? 'Equipo de rescate',
      });
    }

    return destinatarios;
  }

  async listarExpedicionesMonitor(zona?: string): Promise<ExpedicionMonitorLeida[]> {
    let query = this.supabase
      .from('expediciones')
      .select(
        `
        id, estado, lugar_inicio, lugar_fin, coordenadas_inicio, coordenadas_fin,
        hora_inicio, hora_retorno_estimada,
        minutos_tolerancia, actualizado_en,
        acompanantes_expedicion ( count ),
        perfiles_senderista ( nombre_completo, telefono )
      `,
      )
      .in('estado', ['en_progreso', 'alerta'])
      .order('hora_retorno_estimada', { ascending: true });

    if (zona) {
      query = query.ilike('lugar_fin', `%${zona}%`);
    }

    const { data, error } = await query;
    if (error) throw new ErrorAplicacion(500, error.message);
    return ((data ?? []) as unknown as FilaExpedicionMonitor[]).map(mapearExpedicionMonitorPersistida);
  }

  async buscarConfirmacionesPorExpediciones(
    expedicionIds: string[],
    rescatistaId: string,
  ): Promise<Map<string, BitacoraRescateLeida>> {
    if (expedicionIds.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('bitacoras_rescate')
      .select('id, expedicion_id, estado_rescate, actualizado_en, notas')
      .eq('rescatista_id', rescatistaId)
      .in('expedicion_id', expedicionIds);

    if (error) throw new ErrorAplicacion(500, error.message);

    const mapa = new Map<string, BitacoraRescateLeida>();
    for (const fila of data ?? []) {
      mapa.set(fila.expedicion_id, mapearBitacoraRescatePersistida(fila));
    }
    return mapa;
  }

  async listarExpedicionesEnAlerta(): Promise<ExpedicionAlertaLeida[]> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        `
        id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada,
        minutos_tolerancia, actualizado_en,
        acompanantes_expedicion ( count ),
        perfiles_senderista ( nombre_completo, telefono )
      `,
      )
      .eq('estado', 'alerta')
      .order('actualizado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    return ((data ?? []) as unknown as FilaExpedicionAlerta[]).map(mapearExpedicionAlertaPersistida);
  }

  async buscarConfirmacion(
    expedicionId: string,
    rescatistaId: string,
  ): Promise<BitacoraRescateLeida | null> {
    const { data, error } = await this.supabase
      .from('bitacoras_rescate')
      .select('id, expedicion_id, estado_rescate, actualizado_en, notas')
      .eq('expedicion_id', expedicionId)
      .eq('rescatista_id', rescatistaId)
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    return data ? mapearBitacoraRescatePersistida(data) : null;
  }

  async buscarExpedicionEnAlerta(expedicionId: string): Promise<ExpedicionAlertaLeida | null> {
    const { data, error } = await this.supabase
      .from('expediciones')
      .select(
        `
        id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada,
        minutos_tolerancia, actualizado_en,
        perfiles_senderista ( nombre_completo, telefono )
      `,
      )
      .eq('id', expedicionId)
      .eq('estado', 'alerta')
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    return data ? mapearExpedicionAlertaPersistida(data as unknown as FilaExpedicionAlerta) : null;
  }

  async crearConfirmacion(
    expedicionId: string,
    rescatistaId: string,
    notas?: string,
  ): Promise<BitacoraRescateLeida> {
    const { data, error } = await this.supabase
      .from('bitacoras_rescate')
      .insert({
        expedicion_id: expedicionId,
        rescatista_id: rescatistaId,
        estado_rescate: 'en_busqueda',
        notas: notas ?? null,
      })
      .select('id, expedicion_id, estado_rescate, actualizado_en, notas')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ErrorAplicacion(409, 'Ya confirmaste esta alerta', 'YA_CONFIRMADO');
      }
      throw new ErrorAplicacion(500, error.message);
    }

    return mapearBitacoraRescatePersistida(data);
  }

  async actualizarBitacoraRescate(
    expedicionId: string,
    rescatistaId: string,
    input: { estadoRescate?: string; notas?: string },
  ): Promise<BitacoraRescateLeida> {
    const actualizaciones: Record<string, string | null> = {
      actualizado_en: new Date().toISOString(),
    };
    if (input.estadoRescate !== undefined) actualizaciones.estado_rescate = input.estadoRescate;
    if (input.notas !== undefined) actualizaciones.notas = input.notas;

    const { data, error } = await this.supabase
      .from('bitacoras_rescate')
      .update(actualizaciones)
      .eq('expedicion_id', expedicionId)
      .eq('rescatista_id', rescatistaId)
      .select('id, expedicion_id, estado_rescate, actualizado_en, notas')
      .maybeSingle();

    if (error) throw new ErrorAplicacion(500, error.message);
    if (!data) {
      throw new ErrorAplicacion(404, 'Debes confirmar la alerta antes de actualizar la bitácora', 'NO_ENCONTRADO');
    }

    return mapearBitacoraRescatePersistida(data);
  }

  async listarHistorialCompletadas(rescatistaId: string): Promise<HistorialRescatistaLeido[]> {
    const { data, error } = await this.supabase
      .from('bitacoras_rescate')
      .select(
        `
        id, expedicion_id, estado_rescate, actualizado_en, notas,
        expediciones!inner (
          id, estado, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada,
          minutos_tolerancia, actualizado_en,
          perfiles_senderista ( nombre_completo, telefono )
        )
      `,
      )
      .eq('rescatista_id', rescatistaId)
      .eq('expediciones.estado', 'completada')
      .order('actualizado_en', { ascending: false });

    if (error) throw new ErrorAplicacion(500, error.message);
    return ((data ?? []) as unknown as FilaHistorialRescatista[]).map(mapearHistorialRescatistaPersistido);
  }
}
