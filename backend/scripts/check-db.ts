import { loadEnv } from '../src/infrastructure/config/env.js';
import { verificarConexionBaseDatos } from '../src/infrastructure/database/supabase.js';

loadEnv();

verificarConexionBaseDatos()
  .then(() => console.log('[db-check] OK — Supabase conectado'))
  .catch((err) => {
    console.error('[db-check] FAIL —', err instanceof Error ? err.message : err);
    process.exit(1);
  });
