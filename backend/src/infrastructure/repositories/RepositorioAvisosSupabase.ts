import type { Aviso, TipoAviso } from '../../domain/entities/Aviso.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin } from '../database/supabase.js';

type FilaAviso = {
  id: string;
  usuario_id: string;
  expedicion_id: string | null;
  evento_id: string | null;
  clave_evento: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creado_en: string;
  actualizado_en: string;
};

function mapearFilaAAviso(fila: FilaAviso): Aviso {
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    expedicionId: fila.expedicion_id,
    eventoId: fila.clave_evento,
    tipo: fila.tipo,
    titulo: fila.titulo,
    mensaje: fila.mensaje,
    leido: fila.leido,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export class RepositorioAvisosSupabase implements INotificacionDAO {
  private readonly supabase = getSupabaseAdmin();

  async guardar(input: CrearAvisoInput): Promise<Aviso> {
    const { data, error } = await this.supabase
      .from('avisos_usuario')
      .insert({
        usuario_id: input.usuarioId,
        expedicion_id: input.expedicionId ?? null,
        evento_id: input.tipo === 'recordatorio' ? null : input.eventoId,
        clave_evento: input.eventoId,
        tipo: input.tipo,
        titulo: input.titulo,
        mensaje: input.mensaje,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const existente = await this.buscarPorEvento(input.usuarioId, input.eventoId);
        if (existente) return existente;
      }
      throw new ErrorAplicacion(500, `Error al guardar aviso en base de datos: ${error.message}`);
    }

    return mapearFilaAAviso(data as FilaAviso);
  }

  async buscarPorEvento(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    const { data, error } = await this.supabase
      .from('avisos_usuario')
      .select('*')
      .eq('usuario_id', usuarioId)
      .eq('clave_evento', eventoId)
      .maybeSingle();

    if (error) {
      throw new ErrorAplicacion(500, `Error al consultar aviso por evento: ${error.message}`);
    }

    return data ? mapearFilaAAviso(data as FilaAviso) : null;
  }

  /** Id del evento que HU-26, HU-27 o HU-35 guardaron en eventos_plan con esa operación. */
  async buscarIdEventoPorOperacion(
    operacionId: string,
    expedicionId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('eventos_plan')
      .select('id')
      .eq('operacion_id', operacionId)
      .eq('expedicion_id', expedicionId)
      .maybeSingle();

    if (error) {
      throw new ErrorAplicacion(500, `Error al consultar evento del plan: ${error.message}`);
    }

    return data ? (data as { id: string }).id : null;
  }

  async listarPorUsuario(usuarioId: string, soloNoLeidos = false): Promise<Aviso[]> {
    let query = this.supabase
      .from('avisos_usuario')
      .select('*')
      .eq('usuario_id', usuarioId)
      .order('creado_en', { ascending: false });

    if (soloNoLeidos) {
      query = query.eq('leido', false);
    }

    const { data, error } = await query;
    if (error) {
      throw new ErrorAplicacion(500, `Error al listar avisos: ${error.message}`);
    }

    return (data || []).map((fila: any) => mapearFilaAAviso(fila as FilaAviso));
  }

  async contarNoLeidos(usuarioId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('avisos_usuario')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .eq('leido', false);

    if (error) {
      throw new ErrorAplicacion(500, `Error al contar avisos no leídos: ${error.message}`);
    }

    return count ?? 0;
  }

  async marcarComoLeido(avisoId: string, usuarioId: string): Promise<Aviso> {
    const { data, error } = await this.supabase
      .from('avisos_usuario')
      .update({
        leido: true,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', avisoId)
      .eq('usuario_id', usuarioId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new ErrorAplicacion(500, `Error al marcar aviso como leído: ${error.message}`);
    }

    if (!data) {
      throw new ErrorAplicacion(404, 'Aviso no encontrado o no pertenece al usuario', 'NO_ENCONTRADO');
    }

    return mapearFilaAAviso(data as FilaAviso);
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('avisos_usuario')
      .update({
        leido: true,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', usuarioId)
      .eq('leido', false)
      .select('id');

    if (error) {
      throw new ErrorAplicacion(500, `Error al marcar todos los avisos como leídos: ${error.message}`);
    }

    return data?.length ?? 0;
  }

  async eliminarPorUsuario(usuarioId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('avisos_usuario')
      .delete()
      .eq('usuario_id', usuarioId)
      .select('id');

    if (error) {
      throw new ErrorAplicacion(500, `Error al eliminar avisos por revocación ARCO: ${error.message}`);
    }

    return data?.length ?? 0;
  }
}
