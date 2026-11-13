import { RepositorioOutboxSupabase } from '../repositories/RepositorioOutboxSupabase.js';
import { WorkerOutboxNotificaciones } from '../../application/services/WorkerOutboxNotificaciones.js';
import { BrevoApiTransporteAdapter } from '../email/adapters/BrevoApiTransporteAdapter.js';
import { SmtpTransporteAdapter } from '../email/adapters/SmtpTransporteAdapter.js';
import { DevLogTransporteAdapter } from '../email/adapters/DevLogTransporteAdapter.js';
import { DecoradorRegistroTransporte } from '../email/decorators/DecoradorRegistroTransporte.js';
import { loadEnv } from '../config/env.js';
export function crearWorkerOutbox(){
  const env=loadEnv();
  if(env.nodeEnv==='production'&&!env.brevoApiKey&&!(env.smtpHost&&env.smtpUser&&env.smtpPass)) throw new Error('Transporte real requerido');
  const transporte=env.brevoApiKey?new BrevoApiTransporteAdapter():env.smtpHost&&env.smtpUser&&env.smtpPass?new SmtpTransporteAdapter():new DevLogTransporteAdapter();
  return new WorkerOutboxNotificaciones(new RepositorioOutboxSupabase(),new DecoradorRegistroTransporte(transporte));
}
