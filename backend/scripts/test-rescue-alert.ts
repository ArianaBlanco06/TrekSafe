import { inicializarEntorno, loadEnv } from '../src/infrastructure/config/env.js';
import { crearDependenciasCron } from '../src/infrastructure/composicion/servicios.js';

const expedicionId = process.argv[2] ?? '65e80b99-f1d6-4774-9f02-364bd12a3867';

inicializarEntorno();
loadEnv();

crearDependenciasCron().alertasRescate
  .notificarEquiposRescate(expedicionId)
  .then((r) => {
    console.log('[test-rescue-alert]', JSON.stringify(r));
  })
  .catch((err) => {
    console.error('[test-rescue-alert] error:', err);
    process.exit(1);
  });
