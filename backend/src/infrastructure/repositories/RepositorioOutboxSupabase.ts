import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseAdmin } from '../database/supabase.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { MensajeOutbox, NuevoMensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export class RepositorioOutboxSupabase implements IRepositorioOutbox {
  private readonly supabase = getSupabaseAdmin();
  private readonly rutaArchivoLocal = path.resolve(process.cwd(), '.outbox_dev.json');
  private usandoFallbackMemoria = false;

  constructor() {
    this.asegurarArchivoLocal();
  }

  private asegurarArchivoLocal(): void {
    try {
      if (!fs.existsSync(this.rutaArchivoLocal)) {
        fs.writeFileSync(this.rutaArchivoLocal, JSON.stringify([]), 'utf-8');
      }
    } catch {
      // Ignorar si no se puede escribir
    }
  }

  private leerArchivoLocal(): MensajeOutbox[] {
    try {
      if (fs.existsSync(this.rutaArchivoLocal)) {
        const raw = fs.readFileSync(this.rutaArchivoLocal, 'utf-8');
        const items = JSON.parse(raw);
        return items.map((i: any) => ({
          ...i,
          proximoIntentoEn: new Date(i.proximoIntentoEn),
          bloqueadoHasta: i.bloqueadoHasta ? new Date(i.bloqueadoHasta) : null,
          creadoEn: new Date(i.creadoEn),
          actualizadoEn: new Date(i.actualizadoEn),
          enviadoEn: i.enviadoEn ? new Date(i.enviadoEn) : null,
        }));
      }
    } catch {
      // Fallback a vacio
    }
    return [];
  }

  private guardarArchivoLocal(items: MensajeOutbox[]): void {
    try {
      fs.writeFileSync(this.rutaArchivoLocal, JSON.stringify(items, null, 2), 'utf-8');
    } catch {
      // Fallback silencioso
    }
  }

  private mapearFila(f: any): MensajeOutbox {
    return {
      id: f.id,
      tipoEvento: f.tipo_evento,
      destinatario: f.destinatario,
      asunto: f.asunto,
      cuerpo: f.cuerpo,
      cuerpoHtml: f.cuerpo_html,
      metadata: f.metadata,
      estado: f.estado,
      intentos: f.intentos,
      maxIntentos: f.max_intentos,
      proximoIntentoEn: new Date(f.proximo_intento_en),
      bloqueadoHasta: f.bloqueado_hasta ? new Date(f.bloqueado_hasta) : null,
      bloqueadoPor: f.bloqueado_por,
      ultimoError: f.ultimo_error,
      modoEnvio: f.modo_envio,
      creadoEn: new Date(f.creado_en),
      actualizadoEn: new Date(f.actualizado_en),
      enviadoEn: f.enviado_en ? new Date(f.enviado_en) : null,
    };
  }

  async guardar(mensaje: NuevoMensajeOutbox): Promise<MensajeOutbox> {
    if (!this.usandoFallbackMemoria) {
      try {
        const { data, error } = await this.supabase
          .from('outbox_notificaciones')
          .insert({
            tipo_evento: mensaje.tipoEvento,
            destinatario: mensaje.destinatario,
            asunto: mensaje.asunto,
            cuerpo: mensaje.cuerpo,
            cuerpo_html: mensaje.cuerpoHtml,
            metadata: mensaje.metadata ?? {},
            max_intentos: mensaje.maxIntentos ?? 3,
            estado: 'pendiente',
            intentos: 0,
            proximo_intento_en: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          if (
            error.code === '42P01' ||
            error.code === 'PGRST204' ||
            error.code === 'PGRST205' ||
            error.message?.includes('outbox_notificaciones')
          ) {
            console.warn(
              '[Outbox] Tabla outbox_notificaciones pendiente de aplicar por Sebastian en Supabase DEV. Usando archivo local.',
            );
            this.usandoFallbackMemoria = true;
          } else {
            throw new ErrorAplicacion(500, error.message);
          }
        } else if (data) {
          return this.mapearFila(data);
        }
      } catch (err: any) {
        if (!this.usandoFallbackMemoria) {
          throw err;
        }
      }
    }

    // Fallback local
    const nuevo: MensajeOutbox = {
      id: crypto.randomUUID(),
      tipoEvento: mensaje.tipoEvento,
      destinatario: mensaje.destinatario,
      asunto: mensaje.asunto,
      cuerpo: mensaje.cuerpo,
      cuerpoHtml: mensaje.cuerpoHtml,
      metadata: mensaje.metadata,
      estado: 'pendiente',
      intentos: 0,
      maxIntentos: mensaje.maxIntentos ?? 3,
      proximoIntentoEn: new Date(),
      bloqueadoHasta: null,
      bloqueadoPor: null,
      ultimoError: null,
      modoEnvio: null,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
      enviadoEn: null,
    };

    const items = this.leerArchivoLocal();
    items.push(nuevo);
    this.guardarArchivoLocal(items);
    return nuevo;
  }

  async obtenerParaProcesar(ahora: Date, limite = 10): Promise<MensajeOutbox[]> {
    if (!this.usandoFallbackMemoria) {
      try {
        // Obtenemos mensajes pendientes cuyo proximo_intento_en <= ahora
        // y que NO tengan lease activo (bloqueado_hasta IS NULL OR bloqueado_hasta < ahora)
        const ahoraIso = ahora.toISOString();
        const { data, error } = await this.supabase
          .from('outbox_notificaciones')
          .select('*')
          .eq('estado', 'pendiente')
          .lte('proximo_intento_en', ahoraIso)
          .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${ahoraIso}`)
          .order('proximo_intento_en', { ascending: true })
          .limit(limite);

        if (error) {
          if (
            error.code === '42P01' ||
            error.code === 'PGRST204' ||
            error.code === 'PGRST205' ||
            error.message?.includes('outbox_notificaciones')
          ) {
            this.usandoFallbackMemoria = true;
          } else {
            throw new ErrorAplicacion(500, error.message);
          }
        } else if (data) {
          return data.map((d: any) => this.mapearFila(d));
        }
      } catch (err: any) {
        if (!this.usandoFallbackMemoria) throw err;
      }
    }

    const items = this.leerArchivoLocal();
    return items
      .filter((i) => {
        if (i.estado !== 'pendiente') return false;
        if (i.proximoIntentoEn.getTime() > ahora.getTime()) return false;
        if (i.bloqueadoHasta && i.bloqueadoHasta.getTime() >= ahora.getTime()) return false;
        return true;
      })
      .slice(0, limite);
  }

  async adquirirLease(id: string, workerId: string, duracionMs: number, ahora: Date): Promise<boolean> {
    const hasta = new Date(ahora.getTime() + duracionMs);

    if (!this.usandoFallbackMemoria) {
      try {
        const ahoraIso = ahora.toISOString();
        const hastaIso = hasta.toISOString();

        // Actualización condicional atómica: bloqueado_hasta IS NULL OR bloqueado_hasta < ahora
        const { data, error } = await this.supabase
          .from('outbox_notificaciones')
          .update({
            bloqueado_hasta: hastaIso,
            bloqueado_por: workerId,
            actualizado_en: ahoraIso,
          })
          .eq('id', id)
          .eq('estado', 'pendiente')
          .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${ahoraIso}`)
          .select('id');

        if (error) {
          if (
            error.code === '42P01' ||
            error.code === 'PGRST204' ||
            error.code === 'PGRST205' ||
            error.message?.includes('outbox_notificaciones')
          ) {
            this.usandoFallbackMemoria = true;
          } else {
            return false;
          }
        } else {
          return Array.isArray(data) && data.length > 0;
        }
      } catch {
        if (!this.usandoFallbackMemoria) return false;
      }
    }

    const items = this.leerArchivoLocal();
    const item = items.find((i) => i.id === id);
    if (!item || item.estado !== 'pendiente') return false;
    if (item.bloqueadoHasta && item.bloqueadoHasta.getTime() >= ahora.getTime()) return false;

    item.bloqueadoHasta = hasta;
    item.bloqueadoPor = workerId;
    item.actualizadoEn = ahora;
    this.guardarArchivoLocal(items);
    return true;
  }

  async marcarEnviado(id: string, modoEnvio: string, fechaEnvio: Date): Promise<void> {
    if (!this.usandoFallbackMemoria) {
      try {
        const { error } = await this.supabase
          .from('outbox_notificaciones')
          .update({
            estado: 'enviado',
            modo_envio: modoEnvio,
            enviado_en: fechaEnvio.toISOString(),
            bloqueado_hasta: null,
            bloqueado_por: null,
            actualizado_en: fechaEnvio.toISOString(),
          })
          .eq('id', id);

        if (!error) return;
        if (
          error.code === '42P01' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST205'
        ) {
          this.usandoFallbackMemoria = true;
        }
      } catch {
        this.usandoFallbackMemoria = true;
      }
    }

    const items = this.leerArchivoLocal();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.estado = 'enviado';
      item.modoEnvio = modoEnvio;
      item.enviadoEn = fechaEnvio;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
      item.actualizadoEn = fechaEnvio;
      this.guardarArchivoLocal(items);
    }
  }

  async marcarReintento(
    id: string,
    proximoIntento: Date,
    intentosActuales: number,
    ultimoError: string,
  ): Promise<void> {
    const ahora = new Date();
    if (!this.usandoFallbackMemoria) {
      try {
        const { error } = await this.supabase
          .from('outbox_notificaciones')
          .update({
            intentos: intentosActuales,
            proximo_intento_en: proximoIntento.toISOString(),
            ultimo_error: ultimoError,
            bloqueado_hasta: null,
            bloqueado_por: null,
            actualizado_en: ahora.toISOString(),
          })
          .eq('id', id);

        if (!error) return;
        if (
          error.code === '42P01' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST205'
        ) {
          this.usandoFallbackMemoria = true;
        }
      } catch {
        this.usandoFallbackMemoria = true;
      }
    }

    const items = this.leerArchivoLocal();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.intentos = intentosActuales;
      item.proximoIntentoEn = proximoIntento;
      item.ultimoError = ultimoError;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
      item.actualizadoEn = ahora;
      this.guardarArchivoLocal(items);
    }
  }

  async marcarFallido(id: string, intentosActuales: number, errorFinal: string): Promise<void> {
    const ahora = new Date();
    if (!this.usandoFallbackMemoria) {
      try {
        const { error } = await this.supabase
          .from('outbox_notificaciones')
          .update({
            estado: 'fallido',
            intentos: intentosActuales,
            ultimo_error: errorFinal,
            bloqueado_hasta: null,
            bloqueado_por: null,
            actualizado_en: ahora.toISOString(),
          })
          .eq('id', id);

        if (!error) return;
        if (
          error.code === '42P01' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST205'
        ) {
          this.usandoFallbackMemoria = true;
        }
      } catch {
        this.usandoFallbackMemoria = true;
      }
    }

    const items = this.leerArchivoLocal();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.estado = 'fallido';
      item.intentos = intentosActuales;
      item.ultimoError = errorFinal;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
      item.actualizadoEn = ahora;
      this.guardarArchivoLocal(items);
    }
  }

  async marcarIncierto(id: string, intentosActuales: number, motivoIncierto: string): Promise<void> {
    const ahora = new Date();
    if (!this.usandoFallbackMemoria) {
      try {
        const { error } = await this.supabase
          .from('outbox_notificaciones')
          .update({
            estado: 'incierto',
            intentos: intentosActuales,
            ultimo_error: motivoIncierto,
            bloqueado_hasta: null,
            bloqueado_por: null,
            actualizado_en: ahora.toISOString(),
          })
          .eq('id', id);

        if (!error) return;
        if (
          error.code === '42P01' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST205'
        ) {
          this.usandoFallbackMemoria = true;
        }
      } catch {
        this.usandoFallbackMemoria = true;
      }
    }

    const items = this.leerArchivoLocal();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.estado = 'incierto';
      item.intentos = intentosActuales;
      item.ultimoError = motivoIncierto;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
      item.actualizadoEn = ahora;
      this.guardarArchivoLocal(items);
    }
  }

  async liberarLease(id: string): Promise<void> {
    if (!this.usandoFallbackMemoria) {
      try {
        await this.supabase
          .from('outbox_notificaciones')
          .update({
            bloqueado_hasta: null,
            bloqueado_por: null,
          })
          .eq('id', id);
        return;
      } catch {
        // fallback
      }
    }

    const items = this.leerArchivoLocal();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
      this.guardarArchivoLocal(items);
    }
  }
}
