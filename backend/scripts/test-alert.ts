import { loadEnv } from '../src/infrastructure/config/env.js';
import { ServicioNotificacionAlerta } from '../src/application/services/servicioNotificacionAlerta.js';

const expedicionId = process.argv[2] ?? '65e80b99-f1d6-4774-9f02-364bd12a3867';

loadEnv();

new ServicioNotificacionAlerta()
  .notificarContactosEmergencia(expedicionId)
  .then((r) => {
    console.log('[test-alert]', JSON.stringify(r));
  })
  .catch((err) => {
    console.error('[test-alert] error:', err);
    process.exit(1);
  });
