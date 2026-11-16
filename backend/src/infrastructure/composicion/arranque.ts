import type { DependenciasArranqueApi } from '../../api.js';
import type { DependenciasArranqueWorker } from '../../worker.js';
import { createApp } from '../../presentation/http/app.js';
import { inicializarEntorno, loadEnv } from '../config/env.js';
import { verificarConexionBaseDatos } from '../database/supabase.js';
import { closePool } from '../database/pool.js';
import { ServicioCorreo } from '../email/ServicioCorreo.js';
import { iniciarTareasOperativas } from '../jobs/tareasOperativas.js';
import { crearDependenciasPlazosOperativos } from './operacion.js';
import { procesarPlazosOperativos } from '../../application/use-cases/ProcesarPlazosOperativos.js';
import { crearWorkerOutbox } from './outbox.js';
import { EstadoWorkerSupabase } from '../repositories/EstadoWorkerSupabase.js';

export function crearArranqueApi(): DependenciasArranqueApi {
  inicializarEntorno();
  const env = loadEnv();
  if (env.nodeEnv === 'production' && env.cronEnabled) throw new Error('API_REQUIERE_CRON_DESACTIVADO');
  return {
    port: env.port,
    verificarBase: verificarConexionBaseDatos,
    crearAplicacion: createApp,
    cerrarRecursos: closePool,
  };
}

export async function verificarCorreoConfigurado(): Promise<void> {
  const env = loadEnv();
  if (env.nodeEnv === 'production' && !new ServicioCorreo().estaConfigurado()) {
    throw new Error('WORKER_REQUIERE_TRANSPORTE_REAL');
  }
  try {
    await new ServicioCorreo().verificarConexion();
  } catch (error) {
    if (env.nodeEnv === 'production' && !env.mailDevFallback) throw error;
    console.warn('[TrekSafe] Advertencia de correo en desarrollo:', error);
  }
}

export function crearArranqueWorker(): DependenciasArranqueWorker {
  inicializarEntorno();
  const env = loadEnv();
  if (env.nodeEnv === 'production' && !env.cronEnabled) throw new Error('WORKER_REQUIERE_CRON_ACTIVADO');
  return {
    habilitado: env.cronEnabled,
    verificarBase: verificarConexionBaseDatos,
    verificarCorreo: verificarCorreoConfigurado,
    iniciarTareas: () => {
      const plazos = crearDependenciasPlazosOperativos();
      const outbox = crearWorkerOutbox();
      return iniciarTareasOperativas(env, {
        estado: new EstadoWorkerSupabase(),
        procesarPlazos: () => procesarPlazosOperativos(plazos),
        procesarOutbox: async () => {
          const resumen = await outbox.procesarLote('outbox', env.outboxBatchSize);
          // Los conteos acreditan aceptación del proveedor, nunca recepción.
          console.info('[Outbox] Ciclo', {
            procesados: resumen.procesados,
            aceptados: resumen.exitosos,
            simulados: resumen.registrados,
            reintentados: resumen.reintentados,
            fallidos: resumen.fallidos,
            inciertos: resumen.inciertos,
          });
          return resumen;
        },
      });
    },
    cerrarRecursos: closePool,
  };
}
