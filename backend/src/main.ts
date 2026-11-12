import { iniciarApi } from './api.js';
import { iniciarWorker } from './worker.js';
import { inicializarEntorno, loadEnv } from './infrastructure/config/env.js';
import { verificarConexionBaseDatos } from './infrastructure/database/supabase.js';
import { closePool } from './infrastructure/database/pool.js';
import { createApp } from './presentation/http/app.js';
import { verificarCorreoConfigurado } from './infrastructure/composicion/arranque.js';
import { iniciarCronFechaLimiteExpedicion } from './infrastructure/jobs/cronFechaLimiteExpedicion.js';
import {
  esEntradaPrincipal,
  registrarSenales,
} from './infrastructure/ejecucion/cicloVida.js';

export type DependenciasCompatibilidad = {
  verificarBase(): Promise<void>;
  verificarCorreo(): Promise<void>;
  iniciarWorker(): Promise<{ detener(): Promise<void> }>;
  iniciarApi(): Promise<{ detener(): Promise<void> }>;
  cerrarRecursos(): Promise<void>;
};

function crearDependenciasCompatibilidad(): DependenciasCompatibilidad {
  inicializarEntorno();
  const env = loadEnv();
  return {
    verificarBase: verificarConexionBaseDatos,
    verificarCorreo: verificarCorreoConfigurado,
    iniciarWorker: () =>
      iniciarWorker({
        habilitado: env.cronEnabled,
        verificarBase: async () => {},
        verificarCorreo: async () => {},
        iniciarTareas: () => iniciarCronFechaLimiteExpedicion(env),
        cerrarRecursos: async () => {},
      }),
    iniciarApi: () =>
      iniciarApi({
        port: env.port,
        verificarBase: async () => {},
        crearAplicacion: createApp,
        cerrarRecursos: async () => {},
      }),
    cerrarRecursos: closePool,
  };
}

/** Entrada histórica: conserva API y cron juntos hasta el cambio de despliegue de #110. */
export async function iniciarCompatibilidad(
  dependencias: DependenciasCompatibilidad = crearDependenciasCompatibilidad(),
) {
  let worker:
    | Awaited<ReturnType<DependenciasCompatibilidad['iniciarWorker']>>
    | undefined;
  try {
    await dependencias.verificarBase();
    await dependencias.verificarCorreo();
    worker = await dependencias.iniciarWorker();
    const api = await dependencias.iniciarApi();
    let cierre: Promise<void> | undefined;
    const tareas = worker;
    return {
      detener: () =>
        (cierre ??= (async () => {
          try {
            const resultados = await Promise.allSettled([
              tareas.detener(),
              api.detener(),
            ]);
            const fallo = resultados.find(
              (resultado): resultado is PromiseRejectedResult =>
                resultado.status === 'rejected',
            );
            if (fallo) throw fallo.reason;
          } finally {
            await dependencias.cerrarRecursos();
          }
        })()),
    };
  } catch (error) {
    try {
      await worker?.detener();
    } finally {
      await dependencias.cerrarRecursos();
    }
    throw error;
  }
}

if (esEntradaPrincipal(import.meta.url)) {
  iniciarCompatibilidad()
    .then(({ detener }) => registrarSenales(detener))
    .catch((error) => {
      console.error('[TrekSafe] Fallo de arranque:', error);
      process.exitCode = 1;
    });
}
