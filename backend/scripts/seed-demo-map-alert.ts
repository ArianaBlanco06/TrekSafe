import { loadEnv } from '../src/infrastructure/config/env.js';
import { getSupabaseAdmin } from '../src/infrastructure/database/supabase.js';

const DEMO_EXPEDICION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99';
const SENDERISTA_ID = '11111111-1111-4111-8111-111111111111';
const CONTACTO_ID = '9dbe61f5-d60b-407f-a95b-8a6ca66d4274';

loadEnv();

const supabase = getSupabaseAdmin();

async function sembrarAlertaDemoMapa() {
  const ahora = new Date();
  const horaInicio = new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const horaRetorno = new Date(ahora.getTime() - 4 * 60 * 60 * 1000).toISOString();

  const { error: upsertError } = await supabase.from('expediciones').upsert(
    {
      id: DEMO_EXPEDICION_ID,
      senderista_id: SENDERISTA_ID,
      lugar_inicio: 'Cebollapampa',
      lugar_fin: 'Laguna 69',
      coordenadas_inicio: '-9.00650, -77.60180',
      coordenadas_fin: '-9.00600, -77.61250',
      hora_inicio: horaInicio,
      hora_retorno_estimada: horaRetorno,
      minutos_tolerancia: 30,
      estado: 'alerta',
      actualizado_en: ahora.toISOString(),
    },
    { onConflict: 'id' },
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { error: linkError } = await supabase.from('vinculos_expedicion_contacto').upsert(
    { expedicion_id: DEMO_EXPEDICION_ID, contacto_id: CONTACTO_ID },
    { onConflict: 'expedicion_id,contacto_id' },
  );

  if (linkError && !linkError.message.includes('duplicate')) {
    throw new Error(linkError.message);
  }

  // Evita fallo de descifrado AES en ficha médica durante demo del mapa.
  await supabase.from('fichas_medicas').delete().eq('senderista_id', SENDERISTA_ID);

  console.log('[seed-demo-map-alert] OK', DEMO_EXPEDICION_ID);
}

sembrarAlertaDemoMapa().catch((err) => {
  console.error('[seed-demo-map-alert] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
