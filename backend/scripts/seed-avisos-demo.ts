import { ServicioBandejaAvisos, GeneradorAvisosEvento } from '../src/application/services/servicioBandejaAvisos.js';
import { loadEnv } from '../src/infrastructure/config/env.js';

loadEnv();

const SENDERISTA_ID = '11111111-1111-4111-8111-111111111111';

async function seed() {
  const servicio = new ServicioBandejaAvisos();
  const generador = new GeneradorAvisosEvento(servicio);

  console.log('[Seed] Creando avisos de demostración para senderista@treksafe.pe...');

  await generador.generarDesdeEdicion(
    SENDERISTA_ID,
    'expedicion-demo-01',
    'Se actualizó la hora estimada de retorno a las 18:30 hrs.',
    'evt-edicion-demo',
  );

  await generador.generarDesdeAmpliacion(
    SENDERISTA_ID,
    'expedicion-demo-01',
    '19:45 hrs (+45 min)',
    'evt-ampliacion-demo',
  );

  await generador.generarDesdeRecordatorio(
    SENDERISTA_ID,
    'expedicion-demo-01',
    30,
    'evt-recordatorio-demo',
  );

  const listado = await servicio.listarAvisos(SENDERISTA_ID);
  console.log(`[Seed] ¡Listo! Total avisos: ${listado.avisos.length} (No leídos: ${listado.conteoNoLeidos})`);
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
