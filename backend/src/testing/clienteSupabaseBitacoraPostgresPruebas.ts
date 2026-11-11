import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';
import {
  COLUMNAS_ENTRADA_BITACORA,
  COLUMNAS_INCIDENTE_BITACORA,
} from '../infrastructure/repositories/BitacoraIncidenteDAOSupabase.js';

/**
 * Puente de pruebas para HU-41: el SDK arma las consultas REST y la RPC y aquí se traducen
 * a SQL real ejecutado como service_role. NO es PostgREST; valida SQL, triggers, permisos y
 * mapeo. Solo admite las tres peticiones de BitacoraIncidenteDAOSupabase; cualquier otra
 * lanza un error.
 */
export function clienteSupabaseBitacoraPostgresPruebas(pool: pg.Pool) {
  const igual = (url: URL, columna: string): string => {
    const valor = url.searchParams.get(columna) ?? '';
    if (!valor.startsWith('eq.')) throw new Error(`Filtro eq.${columna} requerido en el puente de pruebas`);
    return valor.slice(3);
  };

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

  const ejecutar: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const metodo = init?.method ?? 'GET';
    const seleccion = url.searchParams.get('select');

    if (metodo === 'GET' && url.pathname === '/rest/v1/incidentes') {
      if (seleccion !== COLUMNAS_INCIDENTE_BITACORA.replace(/\s/g, '')) throw new Error('select inesperado en incidentes');
      const id = igual(url, 'id');
      const filas = await enTransaccion(async (c) =>
        (await c.query(
          `SELECT coalesce(json_agg(json_build_object(
             'id', i.id, 'expedicion_id', i.expedicion_id, 'estado', i.estado, 'version', i.version,
             'responsable_id', i.responsable_id,
             'perfiles_rescatista', json_build_object('nombre_completo', p.nombre_completo)
           )), '[]') AS resultado
           FROM public.incidentes i
           LEFT JOIN public.perfiles_rescatista p ON p.usuario_id = i.responsable_id
           WHERE i.id = $1`,
          [id],
        )).rows[0].resultado);
      return Response.json(filas);
    }

    if (metodo === 'GET' && url.pathname === '/rest/v1/entradas_bitacora_incidente') {
      if (seleccion !== COLUMNAS_ENTRADA_BITACORA.replace(/\s/g, '')) throw new Error('select inesperado en entradas');
      if (url.searchParams.get('order') !== 'registrada_en.asc,secuencia.asc') throw new Error('order inesperado en entradas');
      const id = igual(url, 'incidente_id');
      const filas = await enTransaccion(async (c) =>
        (await c.query(
          `SELECT coalesce(json_agg(json_build_object(
             'id', e.id, 'secuencia', e.secuencia, 'incidente_id', e.incidente_id, 'tipo', e.tipo,
             'texto', e.texto, 'autor_id', e.autor_id, 'registrada_en', e.registrada_en,
             'corrige_entrada_id', e.corrige_entrada_id,
             'perfiles_rescatista', json_build_object('nombre_completo', p.nombre_completo)
           ) ORDER BY e.registrada_en, e.secuencia), '[]') AS resultado
           FROM public.entradas_bitacora_incidente e
           LEFT JOIN public.perfiles_rescatista p ON p.usuario_id = e.autor_id
           WHERE e.incidente_id = $1`,
          [id],
        )).rows[0].resultado);
      return Response.json(filas);
    }

    if (metodo === 'POST' && url.pathname === '/rest/v1/rpc/treksafe_agregar_entrada_bitacora') {
      const datos = JSON.parse(String(init?.body)) as Record<string, unknown>;
      try {
        const resultado = await enTransaccion(async (c) =>
          (await c.query('SELECT public.treksafe_agregar_entrada_bitacora($1,$2,$3,$4,$5) AS resultado', [
            datos.p_incidente_id, datos.p_autor_id, datos.p_texto, datos.p_corrige_entrada_id, datos.p_operacion_id,
          ])).rows[0].resultado);
        return Response.json(resultado);
      } catch (err) {
        // Forma de PostgREST: supabase-js rellena error.message y error.details.
        const error = err as pg.DatabaseError;
        return Response.json({ code: error.code, message: error.message, details: error.detail ?? null, hint: null }, { status: 400 });
      }
    }

    throw new Error(`Petición no admitida en el puente de bitácora: ${metodo} ${url.pathname}`);
  };

  return createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas-hu41', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ejecutar },
  });
}
