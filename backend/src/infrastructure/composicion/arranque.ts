import type { DependenciasArranqueApi } from '../../api.js';
import type { DependenciasArranqueWorker } from '../../worker.js';
import { createApp } from '../../presentation/http/app.js';
import { inicializarEntorno, loadEnv } from '../config/env.js';
import { verificarConexionBaseDatos } from '../database/supabase.js';
import { closePool } from '../database/pool.js';
import { ServicioCorreo } from '../email/ServicioCorreo.js';
import { iniciarCronFechaLimiteExpedicion } from '../jobs/cronFechaLimiteExpedicion.js';

export function crearArranqueApi(): DependenciasArranqueApi {
  inicializarEntorno();
  return {
    port: loadEnv().port,
    verificarBase: verificarConexionBaseDatos,
    crearAplicacion: createApp,
    cerrarRecursos: closePool,
  };
}

export async function verificarCorreoConfigurado(): Promise<void> {
  const env = loadEnv();
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
  return {
    habilitado: env.cronEnabled,
    verificarBase: verificarConexionBaseDatos,
    verificarCorreo: verificarCorreoConfigurado,
    iniciarTareas: () => iniciarCronFechaLimiteExpedicion(env),
    cerrarRecursos: closePool,
  };
}
