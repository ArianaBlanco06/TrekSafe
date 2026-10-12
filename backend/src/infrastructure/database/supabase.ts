import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '../config/env.js';

export type UsuarioBd = {
  id: string;
  correo_electronico: string;
  hash_contrasena: string;
  rol: 'senderista' | 'rescatista';
};

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase con service_role (bypass RLS).
 * Conecta vía HTTPS — evita problemas de Transaction Pooler con pg en Express.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseServiceRoleKey } = loadEnv();
    client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function verificarConexionBaseDatos(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('usuarios').select('id').limit(1);
  if (error) {
    throw new Error(`Supabase DB inalcanzable: ${error.message}`);
  }
}
