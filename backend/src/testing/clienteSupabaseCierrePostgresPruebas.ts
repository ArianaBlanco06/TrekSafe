import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';

/**
 * Puente de pruebas para HU-42: el SDK arma la RPC y aquí se traduce a SQL real ejecutado como
 * service_role. NO es PostgREST; valida SQL, triggers, permisos y mapeo. Solo admite las tres
 * RPC de CierreIncidenteDAOSupabase; cualquier otra petición lanza un error.
 */
export function clienteSupabaseCierrePostgresPruebas(pool: pg.Pool) {
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

    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_cerrar_incidente') {
      return rpc('SELECT public.treksafe_cerrar_incidente($1,$2,$3,$4,$5) AS resultado', [
        datos.p_incidente_id, datos.p_rescatista_id, datos.p_resultado, datos.p_resumen, datos.p_comando_id,
      ]);
    }
    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_marcar_incidente_localizado') {
      return rpc('SELECT public.treksafe_marcar_incidente_localizado($1,$2,$3) AS resultado', [
        datos.p_incidente_id, datos.p_rescatista_id, datos.p_operacion_id,
      ]);
    }
    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_leer_ultimo_cierre_incidente') {
      return rpc('SELECT public.treksafe_leer_ultimo_cierre_incidente($1) AS resultado', [datos.p_expedicion_id]);
    }

    throw new Error(`Petición no admitida en el puente de cierre: ${metodo} ${url.pathname}`);
  };

  return createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu42', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ejecutar },
  });
}
