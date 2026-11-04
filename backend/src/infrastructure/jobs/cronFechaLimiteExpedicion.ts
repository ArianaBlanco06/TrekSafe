import { ServicioNotificacionAlerta } from '../../application/services/servicioNotificacionAlerta.js';
import { ServicioAlertaRescate } from '../../application/services/servicioAlertaRescate.js';
import { ServicioRecordatorioExpedicion } from '../../application/services/servicioRecordatorioExpedicion.js';
import { ServicioCorreo } from '../email/ServicioCorreo.js';
import { loadEnv, type Env } from '../config/env.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { cronHealth } from './cronState.js';

export type ResultadoTickCron = {
  promovidas: number;
  enAlerta: number;
  correosContacto: number;
  correosRescate: number;
  recordatorios?: number;
};

export async function ejecutarTickFechaLimite(
  repo = new RepositorioExpedicion(),
  alertasContacto = new ServicioNotificacionAlerta(),
  alertasRescate = new ServicioAlertaRescate(),
  recordatorios = new ServicioRecordatorioExpedicion(),
): Promise<ResultadoTickCron> {
  const promovidas = await repo.promoverProgramadasListas();

  // HU-38: Procesamiento de recordatorios preventivos con patrón Strategy
  const resRecordatorios = await recordatorios.procesarRecordatorios();

  // CA-03: Alertas críticas de seguridad independientes
  const idsEnAlerta = await repo.marcarEnProgresoExpiradaComoAlerta();

  let correosContacto = 0;
  let correosRescate = 0;

  for (const expedicionId of idsEnAlerta) {
    const contactos = await alertasContacto.notificarContactosEmergencia(expedicionId);
    correosContacto += contactos.enviados + contactos.registrados;

    const rescate = await alertasRescate.notificarEquiposRescate(expedicionId);
    correosRescate += rescate.enviados + rescate.registrados;
  }

  return {
    promovidas,
    enAlerta: idsEnAlerta.length,
    correosContacto,
    correosRescate,
    recordatorios: resRecordatorios.avisosGenerados,
  };
}

export function iniciarCronFechaLimiteExpedicion(
  configuracion: Pick<Env, 'cronEnabled' | 'cronIntervalMs'> = loadEnv(),
): () => void {
  const { cronEnabled, cronIntervalMs } = configuracion;
  // No instanciar repositorios, ejecutar el primer tick ni crear un timer al desactivar.
  if (!cronEnabled) return () => {};
  const repo = new RepositorioExpedicion();
  const alertasContacto = new ServicioNotificacionAlerta();
  const alertasRescate = new ServicioAlertaRescate();
  const modoCorreo = new ServicioCorreo().getModoTransporte();

  const tick = async () => {
    try {
      const { promovidas, enAlerta, correosContacto, correosRescate } =
        await ejecutarTickFechaLimite(repo, alertasContacto, alertasRescate);

      cronHealth.lastTickAt = new Date().toISOString();
      cronHealth.lastError = null;
      cronHealth.lastPromoted = promovidas;
      cronHealth.lastAlerted = enAlerta;

      if (promovidas > 0 || enAlerta > 0) {
        console.log(
          `[Cron] fechas límite: promovidas=${promovidas} enAlerta=${enAlerta} correosContacto=${correosContacto} correosRescate=${correosRescate}`,
        );
      }
    } catch (err) {
      cronHealth.lastError = err instanceof Error ? err.message : String(err);
      console.error('[Cron] tick de fecha límite falló:', err);
    }
  };

  void tick();

  const timer = setInterval(() => {
    void tick();
  }, cronIntervalMs);

  console.log(
    `[Cron] job de fechas límite iniciado (intervalo=${cronIntervalMs}ms, correo=${modoCorreo})`,
  );

  return () => clearInterval(timer);
}
