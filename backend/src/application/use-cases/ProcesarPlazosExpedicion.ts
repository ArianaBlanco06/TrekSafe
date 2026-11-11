import type { IRepositorioExpedicion } from '../ports/RepositorioExpedicion.js';
import type { ResultadoAlertaContacto } from '../services/servicioNotificacionAlerta.js';
import type { ResultadoAlertaRescate } from '../services/servicioAlertaRescate.js';
import type { ResultadoProcesamientoRecordatorios } from '../services/servicioRecordatorioExpedicion.js';

export type DependenciasPlazos = {
  repo: Pick<
    IRepositorioExpedicion,
    'promoverProgramadasListas' | 'marcarEnProgresoExpiradaComoAlerta'
  >;
  alertasContacto: {
    notificarContactosEmergencia(id: string): Promise<ResultadoAlertaContacto>;
  };
  alertasRescate: {
    notificarEquiposRescate(id: string): Promise<ResultadoAlertaRescate>;
  };
  recordatorios: {
    procesarRecordatorios(): Promise<ResultadoProcesamientoRecordatorios>;
  };
};
export type ResultadoTickCron = {
  promovidas: number;
  enAlerta: number;
  correosContacto: number;
  correosRescate: number;
  recordatoriosGenerados?: number;
};

/** Orquestación compartida por el arranque legado y el procesador independiente. */
export async function procesarPlazos({
  repo,
  alertasContacto,
  alertasRescate,
  recordatorios,
}: DependenciasPlazos): Promise<ResultadoTickCron> {
  const promovidas = await repo.promoverProgramadasListas();
  const ids = await repo.marcarEnProgresoExpiradaComoAlerta();
  let correosContacto = 0,
    correosRescate = 0;
  for (const id of ids) {
    const contactos = await alertasContacto.notificarContactosEmergencia(id);
    correosContacto += contactos.enviados + contactos.registrados;
    const rescate = await alertasRescate.notificarEquiposRescate(id);
    correosRescate += rescate.enviados + rescate.registrados;
  }
  const result: ResultadoTickCron = {
    promovidas,
    enAlerta: ids.length,
    correosContacto,
    correosRescate,
  };
  try {
    const recordatorio = await recordatorios.procesarRecordatorios();
    if (recordatorio.avisosGenerados > 0)
      result.recordatoriosGenerados = recordatorio.avisosGenerados;
  } catch (error) {
    console.error(
      '[Cron] Error al procesar recordatorios de expediciones:',
      error,
    );
  }
  return result;
}
