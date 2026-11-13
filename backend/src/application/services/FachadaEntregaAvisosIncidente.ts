import type { IConsultaDespachos,IColaDespachos } from '../ports/despachos.js';
export type { ResultadoReintentoManualDTO } from '../ports/despachos.js';
/** Consulta y comando distintos; la autorización y la idempotencia son transaccionales. */
export class FachadaEntregaAvisosIncidente {
  constructor(private readonly consulta:IConsultaDespachos,private readonly cola:IColaDespachos){}
  async consultarDespachosIncidente(actor:string,expedicion:string){
    const mensajes=await this.consulta.listarAutorizados(actor,expedicion);
    const despachos=mensajes.map(m=>({id:m.id,destinatario:m.destinatario,asunto:m.asunto,tipoEvento:m.tipoEvento,
      canal:m.canal,estado:m.estado,intentos:m.intentos,maxIntentos:m.maxIntentos,modoEnvio:m.modoEnvio??null,
      ultimoError:m.ultimoError??null,proximoIntentoEn:m.proximoIntentoEn.toISOString(),enviadoEn:m.enviadoEn?.toISOString()??null,
      creadoEn:m.creadoEn.toISOString(),simulado:m.modoEnvio==='dev-log',permiteReintentoManual:m.estado==='fallido'}));
    return {expedicionId:expedicion,totalDespachos:despachos.length,
      enviados:despachos.filter(m=>m.estado==='enviado'&&!m.simulado).length,
      simulados:despachos.filter(m=>m.estado==='enviado'&&m.simulado).length,
      fallidos:despachos.filter(m=>m.estado==='fallido').length,inciertos:despachos.filter(m=>m.estado==='incierto').length,
      pendientes:despachos.filter(m=>m.estado==='pendiente').length,despachos};
  }
  reintentarDespachoManual(actor:string,expedicion:string,mensaje:string,clave:string){
    return this.cola.reintentarAutorizado(actor,expedicion,mensaje,clave);
  }
}
