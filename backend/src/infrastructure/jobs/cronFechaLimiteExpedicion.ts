import { ServicioNotificacionAlerta } from '../../application/services/servicioNotificacionAlerta.js';
import { ServicioAlertaRescate } from '../../application/services/servicioAlertaRescate.js';
import { ServicioCorreo } from '../email/ServicioCorreo.js';
import { loadEnv } from '../config/env.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { cronHealth } from './cronState.js';

export type ResultadoTickCron = {
  promovidas: number;
  enAlerta: number;
  correosContacto: number;
  correosRescate: number;
};

export async function ejecutarTickFechaLimite(
  repo = new RepositorioExpedicion(),
  alertasContacto = new ServicioNotificacionAlerta(),
  alertasRescate = new ServicioAlertaRescate(),
): Promise<ResultadoTickCron> {
  const promovidas = await repo.promoverProgramadasListas();
  const idsEnAlerta = await repo.marcarEnProgresoExpiradaComoAlerta();

  let correosContacto = 0;
  let correosRescate = 0;

  for (const expedicionId of idsEnAlerta) {
    const contactos = await alertasContacto.notificarContactosEmergencia(expedicionId);
    correosContacto += contactos.enviados + contactos.registrados;

    const rescate = await alertasRescate.notificarEquiposRescate(expedicionId);
    correosRescate += rescate.enviados + rescate.registrados;
  }

  return { promovidas, enAlerta: idsEnAlerta.length, correosContacto, correosRescate };
}

export function iniciarCronFechaLimiteExpedicion(): () => void {
  const { cronIntervalMs } = loadEnv();
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
