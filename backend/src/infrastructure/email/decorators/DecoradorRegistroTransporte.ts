import type { ITransporteCorreo,DatosEnvioCorreo } from '../../../domain/services/ITransporteCorreo.js';
import type { ResultadoEnvioTransporte } from '../../../domain/entities/OutboxNotificacion.js';
export class DecoradorRegistroTransporte implements ITransporteCorreo {
  constructor(private readonly decorado:ITransporteCorreo) {}
  obtenerModo(){return this.decorado.obtenerModo();}
  async enviar(datos:DatosEnvioCorreo):Promise<ResultadoEnvioTransporte> {
    const inicio=Date.now();
    let resultado:ResultadoEnvioTransporte;
    try { resultado=await this.decorado.enviar(datos); }
    catch { resultado={estado:'incierto',modo:this.obtenerModo(),error:'RESULTADO_INCIERTO'}; }
    console.info('[Outbox:Transporte]',{modo:resultado.modo,resultado:resultado.estado,duracionMs:Date.now()-inicio});
    return {...resultado,error:resultado.estado==='enviado'?undefined:resultado.estado==='incierto'?'RESULTADO_INCIERTO':'RECHAZO_CONFIRMADO',
      detalles:{duracionMs:Date.now()-inicio}};
  }
}
