import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';

const operaciones: Record<string, { sql: string; parametros: readonly string[] }> = {
  treksafe_obtener_preparacion: { sql: 'SELECT public.treksafe_obtener_preparacion($1,$2) AS resultado', parametros: ['p_senderista_id', 'p_expedicion_id'] },
  treksafe_asociar_lista_expedicion: { sql: 'SELECT public.treksafe_asociar_lista_expedicion($1,$2,$3) AS resultado', parametros: ['p_senderista_id', 'p_expedicion_id', 'p_lista_id'] },
  treksafe_establecer_item_preparado: { sql: 'SELECT public.treksafe_establecer_item_preparado($1,$2,$3,$4) AS resultado', parametros: ['p_senderista_id', 'p_expedicion_id', 'p_item_id', 'p_preparado'] },
  treksafe_listar_listas_equipo: { sql: 'SELECT public.treksafe_listar_listas_equipo($1) AS resultado', parametros: ['p_senderista_id'] },
  treksafe_obtener_lista_equipo: { sql: 'SELECT public.treksafe_obtener_lista_equipo($1,$2) AS resultado', parametros: ['p_senderista_id', 'p_lista_id'] },
  treksafe_crear_lista_equipo: { sql: 'SELECT public.treksafe_crear_lista_equipo($1,$2) AS resultado', parametros: ['p_senderista_id', 'p_datos'] },
  treksafe_actualizar_lista_equipo: { sql: 'SELECT public.treksafe_actualizar_lista_equipo($1,$2,$3) AS resultado', parametros: ['p_senderista_id', 'p_lista_id', 'p_datos'] },
  treksafe_eliminar_lista_equipo: { sql: 'SELECT public.treksafe_eliminar_lista_equipo($1,$2) AS resultado', parametros: ['p_senderista_id', 'p_lista_id'] },
};

/**
 * Puente de pruebas: el SDK serializa la RPC y PostgreSQL ejecuta el SQL real como service_role.
 * Sustituye fetch; NO es PostgREST ni prueba el despliegue de Supabase.
 */
export function clienteSupabasePostgresPruebas(pool: pg.Pool) {
  const ejecutar: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const nombre = url.pathname.split('/').at(-1) ?? '';
    const operacion = operaciones[nombre];
    if (!operacion || init?.method !== 'POST') throw new Error('RPC inesperada en el puente de pruebas');
    const datos = JSON.parse(String(init.body)) as Record<string, unknown>;
    const conexion = await pool.connect();
    try {
      await conexion.query('BEGIN');
      await conexion.query('SET LOCAL ROLE service_role');
      const valores = operacion.parametros.map((clave) => {
        const valor = datos[clave];
        return typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : valor;
      });
      const resultado = await conexion.query(operacion.sql, valores);
      await conexion.query('COMMIT');
      return Response.json(resultado.rows[0].resultado);
    } catch (err) {
      await conexion.query('ROLLBACK');
      const error = err as pg.DatabaseError;
      return Response.json({ code: error.code, message: error.message, details: error.detail, hint: null }, { status: 400 });
    } finally {
      conexion.release();
    }
  };
  return createClient('http://127.0.0.1:1', 'clave-ficticia-pruebas', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: ejecutar },
  });
}
