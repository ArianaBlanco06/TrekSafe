import { loadEnv } from '../src/infrastructure/config/env.js';
import { ServicioAlertaRescate } from '../src/application/services/servicioAlertaRescate.js';

const expedicionId = process.argv[2] ?? '65e80b99-f1d6-4774-9f02-364bd12a3867';

loadEnv();

new ServicioAlertaRescate()
  .notificarEquiposRescate(expedicionId)
  .then((r) => {
    console.log('[test-rescue-alert]', JSON.stringify(r));
  })
  .catch((err) => {
    console.error('[test-rescue-alert] error:', err);
    process.exit(1);
  });
