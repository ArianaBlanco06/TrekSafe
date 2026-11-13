import { randomUUID } from 'node:crypto';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { ITransporteCorreo } from '../../domain/services/ITransporteCorreo.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import type { ResultadoEnvioTransporte } from '../../domain/entities/OutboxNotificacion.js';

export interface PoliticaEsperaReintento { calcularEsperaMs(intento:number):number; }
export class PoliticaEsperaExponencial implements PoliticaEsperaReintento {
  calcularEsperaMs(intento:number) { return intento<=1 ? 60000 : 300000; }
}
/** El repositorio persiste reserva, inicio y resultado; no se envía sin inicio confirmado. */
export class WorkerOutboxNotificaciones {
  private readonly reloj:IReloj;
  private readonly duracionLeaseMs:number;
  constructor(private readonly repositorio:IRepositorioOutbox,private readonly transporte:ITransporteCorreo,
    opciones?:{reloj?:IReloj;duracionLeaseMs?:number;politicaEspera?:PoliticaEsperaReintento}) {
    this.reloj=opciones?.reloj??{ahora:()=>new Date()};
    this.duracionLeaseMs=opciones?.duracionLeaseMs??300000;
  }
  async procesarLote(_workerId:string,limite=10) {
    const resumen={procesados:0,exitosos:0,registrados:0,reintentados:0,fallidos:0,inciertos:0};
    const pendientes=await this.repositorio.obtenerParaProcesar(this.reloj.ahora(),limite);
    for(const candidato of pendientes) {
      // Un token por adquisición, nunca un id de proceso reutilizable.
      const token=randomUUID();
      if(!await this.repositorio.adquirirLease(candidato.id,token,this.duracionLeaseMs,this.reloj.ahora())) continue;
      const mensaje=await this.repositorio.iniciarIntento(candidato.id,token);
      if(!mensaje) continue;
      resumen.procesados++;
      let resultado:ResultadoEnvioTransporte;
      try {
        resultado=await this.transporte.enviar({destinatario:mensaje.destinatario,asunto:mensaje.asunto,
          cuerpoTexto:mensaje.cuerpo,cuerpoHtml:mensaje.cuerpoHtml});
      } catch {
        resultado={estado:'incierto',modo:this.transporte.obtenerModo(),error:'RESULTADO_INCIERTO'};
      }
      // Si falla la confirmación SQL, se conserva el inicio y al vencer queda incierto.
      const fin=await this.repositorio.finalizarIntento(mensaje.id,token,resultado.estado,resultado.modo,this.reloj.ahora());
      if(fin==='enviado') resultado.modo==='dev-log' ? resumen.registrados++ : resumen.exitosos++;
      else if(fin==='reintentado') resumen.reintentados++;
      else if(fin==='fallido') resumen.fallidos++;
      else if(fin==='incierto') resumen.inciertos++;
    }
    return resumen;
  }
}
