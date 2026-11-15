import { inicializarEntorno, loadEnv } from '../src/infrastructure/config/env.js';
import { procesarPlazosOperativos } from '../src/application/use-cases/ProcesarPlazosOperativos.js';
import { crearDependenciasPlazosOperativos } from '../src/infrastructure/composicion/operacion.js';

inicializarEntorno();
if (!loadEnv().cronEnabled) throw new Error('Se requiere CRON_ENABLED=true explícito para este productor');

procesarPlazosOperativos(crearDependenciasPlazosOperativos())
  .then((r) => {
    console.log('[cron-tick]', JSON.stringify(r));
  })
  .catch((err) => {
    console.error('[cron-tick] error:', err);
    process.exit(1);
  });
