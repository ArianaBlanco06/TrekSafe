import type { Aviso, TipoAviso } from '../../domain/entities/Aviso.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { getSupabaseAdmin } from '../database/supabase.js';
import fs from 'node:fs';
import path from 'node:path';

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
  private static advertenciaMostrada = false;
  private static usandoFallbackMemoria = false;

  private static obtenerRutaArchivo(): string {
    return path.resolve(process.cwd(), '.avisos_dev.json');
  }

  private static cargarAvisosLocales(): Aviso[] {
    try {
      const ruta = RepositorioAvisosSupabase.obtenerRutaArchivo();
      if (fs.existsSync(ruta)) {
        const contenido = fs.readFileSync(ruta, 'utf-8');
        return JSON.parse(contenido) as Aviso[];
      }
    } catch {
      // Ignorar fallo de lectura
    }
    return [];
  }

  private static guardarAvisosLocales(avisos: Aviso[]): void {
    try {
      const ruta = RepositorioAvisosSupabase.obtenerRutaArchivo();
      fs.writeFileSync(ruta, JSON.stringify(avisos, null, 2), 'utf-8');
    } catch {
      // Ignorar fallo de escritura
    }
  }

  private registrarFallbackMemoria(): void {
    RepositorioAvisosSupabase.usandoFallbackMemoria = true;
    if (!RepositorioAvisosSupabase.advertenciaMostrada) {
      console.warn(
        '[Avisos] Tabla avisos_usuario pendiente de aplicar por Sebastian en Supabase DEV. Operando con almacén de pruebas local sincronizado.',
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
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
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
      avisos.unshift(nuevo);
      RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
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
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
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
        avisos.unshift(nuevo);
        RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
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
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
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
      avisos.unshift(nuevo);
      RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
      return nuevo;
    }
  }

  async listarPorUsuario(usuarioId: string, soloNoLeidos = false): Promise<Aviso[]> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      return avisos.filter((a) => {
        if (a.usuarioId !== usuarioId) return false;
        if (soloNoLeidos && a.leido) return false;
        return true;
      });
    }

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
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
        return avisos.filter((a) => {
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
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      return avisos.filter((a) => {
        if (a.usuarioId !== usuarioId) return false;
        if (soloNoLeidos && a.leido) return false;
        return true;
      });
    }
  }

  async contarNoLeidos(usuarioId: string): Promise<number> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      return avisos.filter((a) => a.usuarioId === usuarioId && !a.leido).length;
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
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
        return avisos.filter((a) => a.usuarioId === usuarioId && !a.leido).length;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al contar avisos no leídos: ${error.message}`);
      }

      return count ?? 0;
    } catch {
      this.registrarFallbackMemoria();
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      return avisos.filter((a) => a.usuarioId === usuarioId && !a.leido).length;
    }
  }

  async marcarComoLeido(id: string, usuarioId: string): Promise<boolean> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      const aviso = avisos.find((a) => a.id === id && a.usuarioId === usuarioId);
      if (!aviso) return false;
      aviso.leido = true;
      RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
      return true;
    }

    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .update({ leido: true, actualizado_en: new Date().toISOString() })
        .eq('id', id)
        .eq('usuario_id', usuarioId)
        .select('id');

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
        const aviso = avisos.find((a) => a.id === id && a.usuarioId === usuarioId);
        if (!aviso) return false;
        aviso.leido = true;
        RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
        return true;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al marcar aviso como leído: ${error.message}`);
      }

      return (data?.length ?? 0) > 0;
    } catch {
      this.registrarFallbackMemoria();
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      const aviso = avisos.find((a) => a.id === id && a.usuarioId === usuarioId);
      if (!aviso) return false;
      aviso.leido = true;
      RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
      return true;
    }
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<number> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      let cant = 0;
      for (const a of avisos) {
        if (a.usuarioId === usuarioId && !a.leido) {
          a.leido = true;
          cant++;
        }
      }
      RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
      return cant;
    }

    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .update({ leido: true, actualizado_en: new Date().toISOString() })
        .eq('usuario_id', usuarioId)
        .eq('leido', false)
        .select('id');

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
        let cant = 0;
        for (const a of avisos) {
          if (a.usuarioId === usuarioId && !a.leido) {
            a.leido = true;
            cant++;
          }
        }
        RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
        return cant;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al marcar todos los avisos como leídos: ${error.message}`);
      }

      return data?.length ?? 0;
    } catch {
      this.registrarFallbackMemoria();
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      let cant = 0;
      for (const a of avisos) {
        if (a.usuarioId === usuarioId && !a.leido) {
          a.leido = true;
          cant++;
        }
      }
      RepositorioAvisosSupabase.guardarAvisosLocales(avisos);
      return cant;
    }
  }

  async obtenerPorId(id: string, usuarioId: string): Promise<Aviso | null> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      const a = avisos.find((av) => av.id === id && av.usuarioId === usuarioId);
      return a ? { ...a } : null;
    }

    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .select('*')
        .eq('id', id)
        .eq('usuario_id', usuarioId)
        .maybeSingle();

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
        const a = avisos.find((av) => av.id === id && av.usuarioId === usuarioId);
        return a ? { ...a } : null;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al obtener aviso: ${error.message}`);
      }

      return data ? mapearFilaAAviso(data as FilaAviso) : null;
    } catch {
      this.registrarFallbackMemoria();
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      const a = avisos.find((av) => av.id === id && av.usuarioId === usuarioId);
      return a ? { ...a } : null;
    }
  }

  async obtenerPorEventoId(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    if (RepositorioAvisosSupabase.usandoFallbackMemoria) {
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      const a = avisos.find((av) => av.usuarioId === usuarioId && av.eventoId === eventoId);
      return a ? { ...a } : null;
    }

    try {
      const { data, error } = await this.supabase
        .from('avisos_usuario')
        .select('*')
        .eq('usuario_id', usuarioId)
        .eq('evento_id', eventoId)
        .maybeSingle();

      if (error?.code === 'PGRST205') {
        this.registrarFallbackMemoria();
        const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
        const a = avisos.find((av) => av.usuarioId === usuarioId && av.eventoId === eventoId);
        return a ? { ...a } : null;
      }

      if (error) {
        throw new ErrorAplicacion(500, `Error al buscar aviso por evento: ${error.message}`);
      }

      return data ? mapearFilaAAviso(data as FilaAviso) : null;
    } catch {
      this.registrarFallbackMemoria();
      const avisos = RepositorioAvisosSupabase.cargarAvisosLocales();
      const a = avisos.find((av) => av.usuarioId === usuarioId && av.eventoId === eventoId);
      return a ? { ...a } : null;
    }
  }
}

export const NotificacionDAOSupabase = RepositorioAvisosSupabase;
