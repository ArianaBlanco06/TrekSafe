import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';

/**
 * Puente de pruebas para HU-50: el SDK arma la RPC y aquí se traduce a SQL real ejecutado como
 * service_role. NO es PostgREST; valida SQL, triggers, permisos y mapeo. Solo admite las tres
 * RPC de FichaMedicaIncidenteDAOSupabase; cualquier otra petición lanza un error.
 */
export function clienteSupabaseFichaPostgresPruebas(pool: pg.Pool) {
  async function enTransaccion<T>(accion: (conexion: pg.PoolClient) => Promise<T>): Promise<T> {
    const conexion = await pool.connect();
    try {
      await conexion.query('BEGIN');
      await conexion.query('SET LOCAL ROLE service_role');
      await conexion.query("SET LOCAL TimeZone = 'UTC'");
      const resultado = await accion(conexion);
      await conexion.query('COMMIT');
      return resultado;
    } catch (error) {
      await conexion.query('ROLLBACK');
      throw error;
    } finally {
      conexion.release();
    }
  }

  const rpc = async (consulta: string, parametros: unknown[]): Promise<Response> => {
    try {
      const resultado = await enTransaccion(async (c) => (await c.query(consulta, parametros)).rows[0].resultado);
      return Response.json(resultado);
    } catch (err) {
      // Forma de PostgREST: supabase-js rellena error.message y error.details.
      const error = err as pg.DatabaseError;
      return Response.json({ code: error.code, message: error.message, details: error.detail ?? null, hint: null }, { status: 400 });
    }
  };

  const ejecutar: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const metodo = init?.method ?? 'GET';
    const datos = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_contexto_ficha_medica') {
      return rpc('SELECT public.treksafe_contexto_ficha_medica($1,$2) AS resultado', [datos.p_incidente_id, datos.p_actor_id]);
    }
    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_leer_ficha_cifrada_responsable') {
      return rpc('SELECT public.treksafe_leer_ficha_cifrada_responsable($1,$2) AS resultado', [datos.p_incidente_id, datos.p_actor_id]);
    }
    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_registrar_acceso_ficha_medica') {
      return rpc('SELECT public.treksafe_registrar_acceso_ficha_medica($1,$2,$3,$4) AS resultado', [
        datos.p_incidente_id, datos.p_actor_id, datos.p_resultado, datos.p_motivo,
      ]);
    }

    throw new Error(`Petición no admitida en el puente de la ficha médica: ${metodo} ${url.pathname}`);
  };

  return createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu50', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ejecutar },
  });
}
