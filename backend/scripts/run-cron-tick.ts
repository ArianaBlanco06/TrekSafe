import { loadEnv } from '../src/infrastructure/config/env.js';
import { ejecutarTickFechaLimite } from '../src/infrastructure/jobs/cronFechaLimiteExpedicion.js';

loadEnv();

ejecutarTickFechaLimite()
  .then((r) => {
    console.log('[cron-tick]', JSON.stringify(r));
  })
  .catch((err) => {
    console.error('[cron-tick] error:', err);
    process.exit(1);
  });
