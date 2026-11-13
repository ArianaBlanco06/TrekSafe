import type { MensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
export type ResultadoReintentoManualDTO={id:string;estadoAnterior:string;nuevoEstado:string;mensaje:string};
export interface IConsultaDespachos { listarAutorizados(actorId:string,expedicionId:string):Promise<MensajeOutbox[]>; }
export interface IColaDespachos { reintentarAutorizado(actorId:string,expedicionId:string,mensajeId:string,clave:string):Promise<ResultadoReintentoManualDTO>; }
