import { createApp } from './presentation/http/app.js';
import { loadEnv } from './infrastructure/config/env.js';
import { verificarConexionBaseDatos } from './infrastructure/database/supabase.js';
import { ServicioCorreo } from './infrastructure/email/ServicioCorreo.js';
import { iniciarCronFechaLimiteExpedicion } from './infrastructure/jobs/cronFechaLimiteExpedicion.js';

async function bootstrap() {
  loadEnv();
  const { port, nodeEnv, mailDevFallback } = loadEnv();

  try {
    await verificarConexionBaseDatos();
    console.log('[TrekSafe API] Conexión a base de datos Supabase OK');
  } catch (err) {
    console.error('[TrekSafe API] Fallo en conexión a base de datos:', err);
    process.exit(1);
  }

  try {
    await new ServicioCorreo().verificarConexion();
  } catch (err) {
    if (nodeEnv === 'production' && !mailDevFallback) {
      console.error('[TrekSafe API] Configuración de correo fallida:', err);
      process.exit(1);
    }
    console.warn('[TrekSafe API] Advertencia de verificación de correo (desarrollo continúa):', err);
  }

  iniciarCronFechaLimiteExpedicion();

  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[TrekSafe API] escuchando en http://0.0.0.0:${port}`);
  });
}

bootstrap();
