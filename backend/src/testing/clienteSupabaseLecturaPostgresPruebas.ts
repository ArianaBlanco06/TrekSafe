import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { COLUMNAS_EVENTO_PLAN } from '../infrastructure/repositories/EventosPlanDAOSupabase.js';

/**
 * Puente de pruebas de solo lectura para HU-36: el SDK arma la consulta REST y aquí se
 * traduce a SQL real ejecutado como service_role.
 * NO es PostgREST; valida SQL, triggers, permisos y mapeo.
 * Solo acepta las dos consultas GET de HU-36; cualquier otra petición lanza un error.
 */
export function clienteSupabaseLecturaPostgresPruebas(pool: pg.Pool) {
  const igual = (url: URL, columna: string): string => {
    const valor = url.searchParams.get(columna) ?? '';
    if (!valor.startsWith('eq.')) throw new Error(`Filtro eq.${columna} requerido en el puente de pruebas`);
    return valor.slice(3);
  };

  async function consultar(sql: string, valores: unknown[]): Promise<unknown> {
    const conexion = await pool.connect();
    try {
      await conexion.query('BEGIN');
      await conexion.query('SET LOCAL ROLE service_role');
      await conexion.query("SET LOCAL TimeZone = 'UTC'");
      const resultado = await conexion.query(sql, valores);
      await conexion.query('COMMIT');
      return resultado.rows[0].resultado;
    } catch (error) {
      await conexion.query('ROLLBACK');
      throw error;
    } finally {
      conexion.release();
    }
  }

  const ejecutar: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if ((init?.method ?? 'GET') !== 'GET' || init?.body) throw new Error('Petición no admitida en el puente de lectura');
    const seleccion = url.searchParams.get('select');

    if (url.pathname === '/rest/v1/eventos_plan') {
      if (seleccion !== COLUMNAS_EVENTO_PLAN.replace(/\s/g, '')) throw new Error('select inesperado en eventos_plan');
      if (url.searchParams.get('order') !== 'ocurrido_en.asc,id.asc') throw new Error('order inesperado en eventos_plan');
      const filas = await consultar(`
        SELECT coalesce(json_agg(json_build_object(
          'id', id, 'expedicion_id', expedicion_id, 'senderista_id', senderista_id, 'tipo', tipo,
          'actor_id', actor_id, 'ocurrido_en', ocurrido_en, 'version_resultante', version_resultante,
          'cambios', cambios, 'motivo', motivo, 'operacion_id', operacion_id
        ) ORDER BY ocurrido_en, id), '[]') AS resultado
        FROM public.eventos_plan
        WHERE expedicion_id = $1 AND senderista_id = $2`,
      [igual(url, 'expedicion_id'), igual(url, 'senderista_id')]);
      return Response.json(filas);
    }

    if (url.pathname === '/rest/v1/expediciones') {
      if (seleccion !== 'id') throw new Error('select inesperado en expediciones');
      const filas = await consultar(`
        SELECT coalesce(json_agg(json_build_object('id', id)), '[]') AS resultado
        FROM public.expediciones WHERE id = $1 AND senderista_id = $2`,
      [igual(url, 'id'), igual(url, 'senderista_id')]);
      return Response.json(filas);
    }

    throw new Error(`Ruta no admitida en el puente de lectura: ${url.pathname}`);
  };

  return createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu36', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: ejecutar },
  });
}
