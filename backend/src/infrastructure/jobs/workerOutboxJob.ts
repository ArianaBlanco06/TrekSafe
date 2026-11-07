import { RepositorioOutboxSupabase } from '../repositories/RepositorioOutboxSupabase.js';
import { BrevoApiTransporteAdapter } from '../email/adapters/BrevoApiTransporteAdapter.js';
import { SmtpTransporteAdapter } from '../email/adapters/SmtpTransporteAdapter.js';
import { DevLogTransporteAdapter } from '../email/adapters/DevLogTransporteAdapter.js';
import { DecoradorRegistroTransporte } from '../email/decorators/DecoradorRegistroTransporte.js';
import { WorkerOutboxNotificaciones } from '../../application/services/WorkerOutboxNotificaciones.js';
import { loadEnv, type Env } from '../config/env.js';
import type { ITransporteCorreo } from '../../domain/services/ITransporteCorreo.js';

export function crearTransporteSegunEntorno(): ITransporteCorreo {
  const { brevoApiKey, smtpHost, smtpUser, smtpPass } = loadEnv();

  let baseTransporte: ITransporteCorreo;
  if (brevoApiKey) {
    baseTransporte = new BrevoApiTransporteAdapter();
  } else if (smtpHost && smtpUser && smtpPass) {
    baseTransporte = new SmtpTransporteAdapter();
  } else {
    baseTransporte = new DevLogTransporteAdapter();
  }

  return new DecoradorRegistroTransporte(baseTransporte);
}

export function iniciarWorkerOutbox(
  configuracion: Pick<Env, 'cronEnabled' | 'cronIntervalMs'> = loadEnv(),
): () => void {
  const { cronEnabled, cronIntervalMs } = configuracion;
  if (!cronEnabled) return () => {};

  const repositorio = new RepositorioOutboxSupabase();
  const transporte = crearTransporteSegunEntorno();
  const worker = new WorkerOutboxNotificaciones(repositorio, transporte);
  const workerId = `worker-${process.pid}-${Date.now().toString(36)}`;

  const procesar = async () => {
    try {
      const res = await worker.procesarLote(workerId, 10);
      if (res.procesados > 0) {
        console.log(
          `[Outbox:Worker] ciclo completado: procesados=${res.procesados} exitosos=${res.exitosos} reintentados=${res.reintentados} fallidos=${res.fallidos} inciertos=${res.inciertos}`,
        );
      }
    } catch (err) {
      console.error('[Outbox:Worker] error al procesar lote:', err);
    }
  };

  void procesar();

  const timer = setInterval(() => {
    void procesar();
  }, cronIntervalMs);

  console.log(
    `[Outbox:Worker] worker de notificaciones iniciado (workerId=${workerId}, intervalo=${cronIntervalMs}ms)`,
  );

  return () => clearInterval(timer);
}
