import { getSupabaseAdmin } from '../database/supabase.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { MensajeOutbox, NuevoMensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export class RepositorioOutboxSupabase implements IRepositorioOutbox {
  private readonly supabase = getSupabaseAdmin();

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
      throw new ErrorAplicacion(500, `Error al guardar en outbox: ${error.message}`);
    }

    return this.mapearFila(data);
  }

  async obtenerParaProcesar(ahora: Date, limite = 10): Promise<MensajeOutbox[]> {
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
      throw new ErrorAplicacion(500, `Error al consultar outbox: ${error.message}`);
    }

    return (data || []).map((d: any) => this.mapearFila(d));
  }

  async adquirirLease(id: string, workerId: string, duracionMs: number, ahora: Date): Promise<boolean> {
    const ahoraIso = ahora.toISOString();
    const hastaIso = new Date(ahora.getTime() + duracionMs).toISOString();

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
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  }

  async marcarEnviado(id: string, modoEnvio: string, fechaEnvio: Date): Promise<void> {
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

    if (error) {
      throw new ErrorAplicacion(500, `Error al marcar outbox como enviado: ${error.message}`);
    }
  }

  async marcarReintento(
    id: string,
    proximoIntento: Date,
    intentosActuales: number,
    ultimoError: string,
  ): Promise<void> {
    const ahora = new Date();
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

    if (error) {
      throw new ErrorAplicacion(500, `Error al registrar reintento en outbox: ${error.message}`);
    }
  }

  async marcarFallido(id: string, intentosActuales: number, errorFinal: string): Promise<void> {
    const ahora = new Date();
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

    if (error) {
      throw new ErrorAplicacion(500, `Error al marcar outbox como fallido: ${error.message}`);
    }
  }

  async marcarIncierto(id: string, intentosActuales: number, motivoIncierto: string): Promise<void> {
    const ahora = new Date();
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

    if (error) {
      throw new ErrorAplicacion(500, `Error al marcar outbox como incierto: ${error.message}`);
    }
  }

  async liberarLease(id: string): Promise<void> {
    await this.supabase
      .from('outbox_notificaciones')
      .update({
        bloqueado_hasta: null,
        bloqueado_por: null,
      })
      .eq('id', id);
  }
}
