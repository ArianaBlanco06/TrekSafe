import {
  procesarPlazos,
  type DependenciasPlazos,
  type ResultadoTickCron,
} from '../../application/use-cases/ProcesarPlazosExpedicion.js';
import { crearDependenciasCron } from '../composicion/servicios.js';
import { loadEnv, type Env } from '../config/env.js';
import { cronHealth } from './cronState.js';

export type { ResultadoTickCron };

export async function ejecutarTickFechaLimite(
  repo?: DependenciasPlazos['repo'],
  alertasContacto?: DependenciasPlazos['alertasContacto'],
  alertasRescate?: DependenciasPlazos['alertasRescate'],
  recordatorios?: DependenciasPlazos['recordatorios'],
): Promise<ResultadoTickCron> {
  const base =
    repo && alertasContacto && alertasRescate && recordatorios
      ? undefined
      : crearDependenciasCron();
  return procesarPlazos({
    repo: repo ?? base!.repo,
    alertasContacto: alertasContacto ?? base!.alertasContacto,
    alertasRescate: alertasRescate ?? base!.alertasRescate,
    recordatorios: recordatorios ?? base!.recordatorios,
  });
}

export function iniciarCronFechaLimiteExpedicion(
  configuracion: Pick<Env, 'cronEnabled' | 'cronIntervalMs'> = loadEnv(),
  crearDependencias: () => DependenciasPlazos = crearDependenciasCron,
): () => Promise<void> {
  if (!configuracion.cronEnabled) return async () => {};
  const dependencias = crearDependencias();
  let detenido = false;
  let pendiente: Promise<void> | null = null;
  const tick = (): Promise<void> => {
    if (detenido) return Promise.resolve();
    if (pendiente) return pendiente;
    pendiente = (async () => {
      try {
        const resultado = await procesarPlazos(dependencias);
        cronHealth.lastTickAt = new Date().toISOString();
        cronHealth.lastError = null;
        cronHealth.lastPromoted = resultado.promovidas;
        cronHealth.lastAlerted = resultado.enAlerta;
      } catch (error) {
        cronHealth.lastError =
          error instanceof Error ? error.message : String(error);
        console.error('[Cron] tick de fecha límite falló:', error);
      }
    })().finally(() => {
      pendiente = null;
    });
    return pendiente;
  };
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, configuracion.cronIntervalMs);
  console.log(
    `[Cron] job de fechas límite iniciado (intervalo=${configuracion.cronIntervalMs}ms)`,
  );
  return async () => {
    detenido = true;
    clearInterval(timer);
    await pendiente;
  };
}
