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
    eventoId: fila.evento_id,
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
  // Almacén en memoria de contingencia para pruebas mientras Sebastian aplica la migración SQL en DEV
  private static memoriaFallback: Aviso[] = [];
  private static advertenciaMostrada = false;
  private static usandoFallbackMemoria = false;

  private registrarFallbackMemoria(): void {
    RepositorioAvisosSupabase.usandoFallbackMemoria = true;
    if (!RepositorioAvisosSupabase.advertenciaMostrada) {
      console.warn(
        '[Avisos] Tabla avisos_usuario pendiente de aplicar por Sebastian en Supabase DEV. Operando con almacén de pruebas en memoria.',
      );
      RepositorioAvisosSupabase.advertenciaMostrada = true;
    }
  }

  async crear(datos: CrearAvisoInput): Promise<Aviso> {
    if (datos.eventoId) {
      const existente = await this.obtenerPorEventoId(datos.usuarioId, datos.eventoId);
      if (existente) return existente;
    }

    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const nuevo: Aviso = {
        id: `aviso-mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        usuarioId: datos.usuarioId,
        expedicionId: datos.expedicionId ?? null,
        eventoId: datos.eventoId ?? null,
        tipo: datos.tipo,
        titulo: datos.titulo,
        mensaje: datos.mensaje,
        leido: false,
        creadoEn: new Date().toISOString(),
      };
      RepositorioAvisosSupabase.memoriaFallback.unshift(nuevo);
      return nuevo;
    }

    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .insert({
          usuario_id: datos.usuarioId,
          expedicion_id: datos.expedicionId ?? null,
          evento_id: datos.eventoId ?? null,
          tipo: datos.tipo,
          titulo: datos.titulo,
          mensaje: datos.mensaje,
          leido: false,
        })
        .select('*')
        .single();

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const nuevo: Aviso = {
          id: `aviso-mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          usuarioId: datos.usuarioId,
          expedicionId: datos.expedicionId ?? null,
          eventoId: datos.eventoId ?? null,
          tipo: datos.tipo,
          titulo: datos.titulo,
          mensaje: datos.mensaje,
          leido: false,
          creadoEn: new Date().toISOString(),
        };
        RepositorioAvisosSupabase.memoriaFallback.unshift(nuevo);
        return nuevo;
      }

      if (error || !data) {
        if (datos.eventoId && error?.code === '23505') {
          const existente = await this.obtenerPorEventoId(datos.usuarioId, datos.eventoId);
          if (existente) return existente;
        }
        throw new ErrorAplicacion(500, `Error al crear aviso: ${error?.message}`);
      }

      return mapearFilaAAviso(data as FilaAviso);
    } catch (err) {
      if (err instanceof ErrorAplicacion) throw err;
      this.registrarFallbackMemoria();
      const nuevo: Aviso = {
        id: `aviso-mock-${Date.now()}`,
        usuarioId: datos.usuarioId,
        expedicionId: datos.expedicionId ?? null,
        eventoId: datos.eventoId ?? null,
        tipo: datos.tipo,
        titulo: datos.titulo,
        mensaje: datos.mensaje,
        leido: false,
        creadoEn: new Date().toISOString(),
      };
      RepositorioAvisosSupabase.memoriaFallback.unshift(nuevo);
      return nuevo;
    }
  }

  async listarPorUsuario(usuarioId: string, soloNoLeidos = false): Promise<Aviso[]> {
    try {
      let query = this.supabase
        .from('avisos_usuario')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('creado_en', { ascending: false });

      if (soloNoLeidos) {
        query = query.eq('leido', false);
      }

      const { data, error } = await query;

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        return RepositorioAvisosSupabase.memoriaFallback.filter((a) => {
          if (a.usuarioId !== usuarioId) return false;
          if (soloNoLeidos && a.leido) return false;
          return true;
        });
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al listar avisos: ${error.message}`);
      }

      return ((data as FilaAviso[]) ?? []).map(mapearFilaAAviso);
    } catch (err) {
      if (err instanceof ErrorAplicacion) throw err;
      this.registrarFallbackMemoria();
      return RepositorioAvisosSupabase.memoriaFallback.filter((a) => {
        if (a.usuarioId !== usuarioId) return false;
        if (soloNoLeidos && a.leido) return false;
        return true;
      });
    }
  }

  async contarNoLeidos(usuarioId: string): Promise<number> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      return RepositorioAvisosSupabase.memoriaFallback.filter(
        (a) => a.usuarioId === usuarioId && !a.leido,
      ).length;
    }

    try {
      const respuesta = await this.supabase
        .from('avisos_usuario')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId)
        .eq('leido', false);

      const count = respuesta.count;
      const error: any = respuesta.error;

      if (count === null || error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        return RepositorioAvisosSupabase.memoriaFallback.filter(
          (a) => a.usuarioId === usuarioId && !a.leido,
        ).length;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al contar avisos no leídos: ${error.message}`);
      }

      return count ?? 0;
    } catch {
      this.registrarFallbackMemoria();
      return RepositorioAvisosSupabase.memoriaFallback.filter(
        (a) => a.usuarioId === usuarioId && !a.leido,
      ).length;
    }
  }

  async marcarComoLeido(id: string, usuarioId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .update({ leido: true, actualizado_en: new Date().toISOString() })
        .eq('id', id)
        .eq('usuario_id', usuarioId)
        .select('id');

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const aviso = RepositorioAvisosSupabase.memoriaFallback.find(
          (a) => a.id === id && a.usuarioId === usuarioId,
        );
        if (!aviso) return false;
        aviso.leido = true;
        return true;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al marcar aviso como leído: ${error.message}`);
      }

      return (data?.length ?? 0) > 0;
    } catch {
      this.registrarFallbackMemoria();
      const aviso = RepositorioAvisosSupabase.memoriaFallback.find(
        (a) => a.id === id && a.usuarioId === usuarioId,
      );
      if (!aviso) return false;
      aviso.leido = true;
      return true;
    }
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .update({ leido: true, actualizado_en: new Date().toISOString() })
        .eq('usuario_id', usuarioId)
        .eq('leido', false)
        .select('id');

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        let cant = 0;
        for (const a of RepositorioAvisosSupabase.memoriaFallback) {
          if (a.usuarioId === usuarioId && !a.leido) {
            a.leido = true;
            cant++;
          }
        }
        return cant;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al marcar todos los avisos como leídos: ${error.message}`);
      }

      return data?.length ?? 0;
    } catch {
      this.registrarFallbackMemoria();
      let cant = 0;
      for (const a of RepositorioAvisosSupabase.memoriaFallback) {
        if (a.usuarioId === usuarioId && !a.leido) {
          a.leido = true;
          cant++;
        }
      }
      return cant;
    }
  }

  async obtenerPorId(id: string, usuarioId: string): Promise<Aviso | null> {
    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .select('*')
        .eq('id', id)
        .eq('usuario_id', usuarioId)
        .maybeSingle();

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const a = RepositorioAvisosSupabase.memoriaFallback.find(
          (av) => av.id === id && av.usuarioId === usuarioId,
        );
        return a ? { ...a } : null;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al obtener aviso: ${error.message}`);
      }

      return data ? mapearFilaAAviso(data as FilaAviso) : null;
    } catch {
      this.registrarFallbackMemoria();
      const a = RepositorioAvisosSupabase.memoriaFallback.find(
        (av) => av.id === id && av.usuarioId === usuarioId,
      );
      return a ? { ...a } : null;
    }
  }

  async obtenerPorEventoId(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .select('*')
        .eq('usuario_id', usuarioId)
        .eq('evento_id', eventoId)
        .maybeSingle();

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const a = RepositorioAvisosSupabase.memoriaFallback.find(
          (av) => av.usuarioId === usuarioId && av.eventoId === eventoId,
        );
        return a ? { ...a } : null;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al buscar aviso por evento: ${error.message}`);
      }

      return data ? mapearFilaAAviso(data as FilaAviso) : null;
    } catch {
      this.registrarFallbackMemoria();
      const a = RepositorioAvisosSupabase.memoriaFallback.find(
        (av) => av.usuarioId === usuarioId && av.eventoId === eventoId,
      );
      return a ? { ...a } : null;
    }
  }
}

export const NotificacionDAOSupabase = RepositorioAvisosSupabase;
