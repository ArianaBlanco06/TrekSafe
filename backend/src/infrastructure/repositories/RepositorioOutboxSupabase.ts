import { getSupabaseAdmin } from '../database/supabase.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { MensajeOutbox, NuevoMensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

import type { IConsultaDespachos,IColaDespachos,ResultadoReintentoManualDTO } from '../../application/ports/despachos.js';
export class RepositorioOutboxSupabase implements IRepositorioOutbox,IConsultaDespachos,IColaDespachos {
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

  async obtenerParaProcesar(_ahora:Date,limite=10):Promise<MensajeOutbox[]> {
    const {data,error}=await this.supabase.rpc('treksafe_pendientes_outbox',{p_limite:limite});
    if(error||!Array.isArray(data)) throw new ErrorAplicacion(503,'No se pudieron consultar pendientes');
    return data.map(f=>this.mapearFila(f));
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
  private errorDespacho(error:{message:string;code?:string}):never {
    const codigo=error.message;
    if(['NO_ES_RESPONSABLE','PROHIBIDO','DESPACHO_AJENO'].includes(codigo)) throw new ErrorAplicacion(403,'No tienes acceso a los despachos de este incidente',codigo);
    if(codigo==='NO_ENCONTRADO') throw new ErrorAplicacion(404,'Despacho no encontrado',codigo);
    if(['CLAVE_REUTILIZADA','DESPACHO_NO_FALLIDO'].includes(codigo)) throw new ErrorAplicacion(409,'Solicitud en conflicto',codigo);
    if(['CLAVE_INVALIDA','AVISO_YA_ENVIADO','ESTADO_INCIERTO_REQUIERE_REVISION'].includes(codigo)||error.code==='22P02') throw new ErrorAplicacion(400,'Solicitud de reintento no permitida',codigo);
    throw new ErrorAplicacion(503,'No se pudieron consultar o actualizar los despachos');
  }
  async listarAutorizados(actor:string,expedicion:string):Promise<MensajeOutbox[]> {
    const {data,error}=await this.supabase.rpc('treksafe_despachos_autorizados',{p_actor:actor,p_expedicion:expedicion});
    if(error) this.errorDespacho(error);
    if(!Array.isArray(data)) throw new ErrorAplicacion(503,'Respuesta de despachos inválida');
    return data.map(f=>this.mapearFila(f));
  }
  async reintentarAutorizado(actor:string,expedicion:string,mensaje:string,clave:string):Promise<ResultadoReintentoManualDTO> {
    const {data,error}=await this.supabase.rpc('treksafe_reintentar_despacho',{p_actor:actor,p_expedicion:expedicion,p_mensaje:mensaje,p_clave:clave});
    if(error) this.errorDespacho(error);
    if(!data||typeof data!=='object'||data.id!==mensaje||data.nuevoEstado!=='pendiente') throw new ErrorAplicacion(503,'Respuesta de reintento inválida');
    return data as ResultadoReintentoManualDTO;
  }
}
