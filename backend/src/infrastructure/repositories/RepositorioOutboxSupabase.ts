import { getSupabaseAdmin } from '../database/supabase.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { MensajeOutbox, NuevoMensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export class RepositorioOutboxSupabase implements IRepositorioOutbox {
  constructor(private readonly supabase = getSupabaseAdmin()) {}

  private mapearFila(f: any): MensajeOutbox {
    return {
      id: f.id,
      claveEvento: f.clave_evento,
      canal: f.canal,
      tipoEvento: f.tipo_evento,
      destinatario: f.destinatario,
      destinatarioNormalizado: f.destinatario_normalizado,
      asunto: f.asunto,
      cuerpo: f.cuerpo,
      cuerpoHtml: f.cuerpo_html,
      metadata: f.metadata ?? {},
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
    const canal = mensaje.canal ?? 'correo';
    const { data, error } = await this.supabase
      .from('outbox_notificaciones')
      .insert({
        clave_evento: mensaje.claveEvento,
        canal,
        tipo_evento: mensaje.tipoEvento,
        destinatario: mensaje.destinatario,
        asunto: mensaje.asunto,
        cuerpo: mensaje.cuerpo,
        cuerpo_html: mensaje.cuerpoHtml,
        metadata: mensaje.metadata ?? {},
        max_intentos: Math.min(mensaje.maxIntentos ?? 3,3),
        estado: 'pendiente',
        intentos: 0,
        proximo_intento_en: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Idempotencia: el evento y destinatario ya existen en el canal
        const normalizado = mensaje.destinatario.trim().toLowerCase();
        const { data: existente } = await this.supabase
          .from('outbox_notificaciones')
          .select('*')
          .eq('clave_evento', mensaje.claveEvento)
          .eq('destinatario_normalizado', normalizado)
          .eq('canal', canal)
          .maybeSingle();

        if (existente) return this.mapearFila(existente);
      }
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

  async adquirirLease(id:string,token:string,duracionMs:number,_ahora:Date):Promise<boolean> {
    const {data,error}=await this.supabase.rpc('treksafe_reservar_outbox',{p_id:id,p_reserva:token,p_duracion_ms:duracionMs});
    if(error) throw new ErrorAplicacion(503,'No se pudo reservar el aviso');
    return data===true;
  }
  async iniciarIntento(id:string,token:string):Promise<MensajeOutbox|null> {
    const {data,error}=await this.supabase.rpc('treksafe_iniciar_intento_outbox',{p_id:id,p_reserva:token});
    if(error) throw new ErrorAplicacion(503,'No se pudo registrar el inicio del intento');
    return data?this.mapearFila(data):null;
  }
  async finalizarIntento(id:string,token:string,estado:'enviado'|'fallido'|'incierto',modo:string,_ahora:Date) {
    const {data,error}=await this.supabase.rpc('treksafe_finalizar_intento_outbox',{p_id:id,p_reserva:token,p_estado:estado,p_modo:modo});
    if(error) throw new ErrorAplicacion(503,'No se pudo confirmar el resultado del intento');
    if(!['enviado','reintentado','fallido','incierto','reserva_perdida'].includes(data)) throw new ErrorAplicacion(503,'Resultado de intento inválido');
    return data as import('../../domain/repositories/IRepositorioOutbox.js').FinIntento;
  }

  async buscarPorId(id: string): Promise<MensajeOutbox | null> {
    const { data, error } = await this.supabase
      .from('outbox_notificaciones')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new ErrorAplicacion(500, `Error al buscar en outbox: ${error.message}`);
    }

    return data ? this.mapearFila(data) : null;
  }

  async listarPorExpedicion(expedicionId: string): Promise<MensajeOutbox[]> {
    const { data, error } = await this.supabase
      .from('outbox_notificaciones')
      .select('*')
      .filter('metadata->>expedicionId', 'eq', expedicionId)
      .order('creado_en', { ascending: true });

    if (error) {
      throw new ErrorAplicacion(500, `Error al listar outbox por expedición: ${error.message}`);
    }

    return (data || []).map((d: any) => this.mapearFila(d));
  }

  async reencolarParaReintentoManual(id: string): Promise<MensajeOutbox> {
    const ahora = new Date();
    const { data, error } = await this.supabase
      .from('outbox_notificaciones')
      .update({
        estado: 'pendiente',
        proximo_intento_en: ahora.toISOString(),
        bloqueado_hasta: null,
        bloqueado_por: null,
        actualizado_en: ahora.toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ErrorAplicacion(500, `Error al reencolar outbox: ${error.message}`);
    }

    return this.mapearFila(data);
  }
}
