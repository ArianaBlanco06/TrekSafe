import { crearWorkerOutbox } from '../composicion/outbox.js';
import { loadEnv,type Env } from '../config/env.js';
import type { WorkerOutboxNotificaciones } from '../../application/services/WorkerOutboxNotificaciones.js';
/** Entrada explícita: no se activa al importar ni se incorpora todavía al arranque de #109. */
export function iniciarWorkerOutbox(config:Pick<Env,'cronEnabled'|'cronIntervalMs'>=loadEnv(),worker?:WorkerOutboxNotificaciones):()=>Promise<void> {
  if(!config.cronEnabled) return async()=>{};
  const trabajo=worker??crearWorkerOutbox();
  let cerrando=false; let pendiente:Promise<void>|undefined;
  const ciclo=()=>{
    if(cerrando||pendiente) return;
    pendiente=trabajo.procesarLote('outbox',10).then(()=>{},()=>{console.error('[Outbox] Ciclo fallido; revisar persistencia');})
      .finally(()=>{pendiente=undefined;});
  };
  ciclo();const timer=setInterval(ciclo,config.cronIntervalMs);
  return async()=>{cerrando=true;clearInterval(timer);await pendiente;};
}
