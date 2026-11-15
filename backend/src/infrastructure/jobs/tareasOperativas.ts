import { randomUUID } from 'node:crypto';
import type { IEstadoWorker, CicloWorker } from '../../application/ports/IEstadoWorker.js';

export type ConfiguracionTareasOperativas = {
  cronEnabled: boolean;
  cronIntervalMs: number;
  outboxIntervalMs: number;
};
export type DependenciasTareasOperativas = {
  estado: IEstadoWorker;
  procesarPlazos(): Promise<unknown>;
  procesarOutbox(): Promise<unknown>;
  instanciaId?: string;
};

/** Dos ciclos independientes, sin solapamiento local ni envíos desde el productor. */
export async function iniciarTareasOperativas(
  config: ConfiguracionTareasOperativas,
  dependencias: DependenciasTareasOperativas,
): Promise<() => Promise<void>> {
  if (!config.cronEnabled) return async () => {};
  const instanciaId = dependencias.instanciaId ?? randomUUID();
  await dependencias.estado.registrarInicio(instanciaId);
  let cerrando = false;
  const ciclos: { detener(): Promise<void> }[] = [];

  function iniciarCiclo(ciclo: CicloWorker, intervalo: number, trabajo: () => Promise<unknown>) {
    let pendiente: Promise<void> | undefined;
    const ejecutar = () => {
      if (cerrando || pendiente) return;
      pendiente = (async () => {
        let resultado: 'ok' | 'error' = 'ok';
        try {
          await trabajo();
        } catch {
          resultado = 'error';
          console.error('[Worker] Ciclo fallido', { ciclo });
        }
        try {
          await dependencias.estado.registrarCiclo({
            instanciaId, ciclo, resultado,
            ...(resultado === 'error' ? { codigoError: 'CICLO_FALLIDO' } : {}),
          });
        } catch {
          // El heartbeat anterior caduca; no se fabrica éxito en memoria.
          console.error('[Worker] No se pudo persistir el resultado', { ciclo });
        }
      })().finally(() => { pendiente = undefined; });
    };
    ejecutar();
    const timer = setInterval(ejecutar, intervalo);
    ciclos.push({ detener: async () => { clearInterval(timer); await pendiente; } });
  }

  iniciarCiclo('plazos', config.cronIntervalMs, dependencias.procesarPlazos);
  iniciarCiclo('outbox', config.outboxIntervalMs, dependencias.procesarOutbox);
  let cierre: Promise<void> | undefined;
  return () => (cierre ??= (async () => {
    cerrando = true;
    await Promise.all(ciclos.map((ciclo) => ciclo.detener()));
    await dependencias.estado.registrarParada(instanciaId);
  })());
}
