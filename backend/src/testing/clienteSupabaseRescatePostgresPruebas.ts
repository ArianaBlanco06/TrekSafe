import { createClient } from '@supabase/supabase-js';
import type pg from 'pg';

/** Traduce las lecturas del SDK a PostgreSQL local para la integración de HU-43. */
export function clienteSupabaseRescatePostgresPruebas(pool: pg.Pool) {
  const peticiones: { tabla: string; metodo: string }[] = [];

  function ids(url: URL): string[] {
    const filtro = url.searchParams.get('expedicion_id') ?? '';
    if (!filtro.startsWith('in.(') || !filtro.endsWith(')')) throw new Error('Filtro de expediciones requerido');
    return filtro.slice(4, -1).split(',');
  }

  function igual(url: URL, columna: string): string {
    const filtro = url.searchParams.get(columna) ?? '';
    if (!filtro.startsWith('eq.')) throw new Error(`Filtro requerido para ${columna}`);
    return filtro.slice(3);
  }

  const ejecutar: typeof fetch = async (entrada, opciones) => {
    const url = new URL(typeof entrada === 'string' || entrada instanceof URL ? entrada : entrada.url);
    const tabla = url.pathname.split('/').at(-1)!;
    const metodo = opciones?.method ?? 'GET';
    if (metodo !== 'GET') throw new Error('El puente de prioridad admite lecturas');
    peticiones.push({ tabla, metodo });
    const conexion = await pool.connect();
    try {
      await conexion.query('BEGIN READ ONLY');
      await conexion.query('SET LOCAL ROLE service_role');
      let filas: unknown[];
      switch (tabla) {
        case 'perfiles_rescatista':
          filas = (await conexion.query('SELECT usuario_id FROM public.perfiles_rescatista WHERE usuario_id=$1', [igual(url, 'usuario_id')])).rows;
          break;
        case 'expediciones': {
          const estado = url.searchParams.get('estado');
          if (estado !== 'eq.alerta' && estado !== 'in.(en_progreso,alerta)') throw new Error('Estados inesperados');
          if (!url.searchParams.get('select')?.includes('acompanantes_expedicion(count)')) throw new Error('Falta el conteo de acompañantes');
          const zona = url.searchParams.get('lugar_fin');
          if (zona && !zona.startsWith('ilike.')) throw new Error('Filtro de zona inesperado');
          const estados = estado === 'eq.alerta' ? ['alerta'] : ['en_progreso', 'alerta'];
          filas = (await conexion.query(
            `SELECT e.*, json_build_object('nombre_completo', p.nombre_completo, 'telefono', p.telefono) AS perfiles_senderista,
               json_build_array(json_build_object('count',
                 (SELECT count(*) FROM public.acompanantes_expedicion a WHERE a.expedicion_id=e.id)
               )) AS acompanantes_expedicion
             FROM public.expediciones e
             JOIN public.perfiles_senderista p ON p.usuario_id=e.senderista_id
             WHERE e.estado::text=ANY($1::text[]) AND ($2::text IS NULL OR e.lugar_fin ILIKE $2)
             ORDER BY e.id DESC`,
            [estados, zona?.slice(6) ?? null],
          )).rows.map((fila) => ({
            ...fila,
            hora_inicio: fila.hora_inicio.toISOString(),
            hora_retorno_estimada: fila.hora_retorno_estimada.toISOString(),
            actualizado_en: fila.actualizado_en.toISOString(),
          }));
          break;
        }
        case 'bitacoras_rescate':
          filas = (await conexion.query(
            'SELECT * FROM public.bitacoras_rescate WHERE expedicion_id=ANY($1::uuid[]) AND rescatista_id=$2',
            [ids(url), igual(url, 'rescatista_id')],
          )).rows;
          break;
        case 'incidentes':
          if (url.searchParams.get('estado') !== 'neq.cerrado') throw new Error('Se requieren coordinaciones vigentes');
          filas = (await conexion.query(
            `SELECT i.id,i.expedicion_id,i.version,i.responsable_id,i.asumido_en,
               json_build_object('nombre_completo',p.nombre_completo) AS perfiles_rescatista
             FROM public.incidentes i JOIN public.perfiles_rescatista p ON p.usuario_id=i.responsable_id
             WHERE i.expedicion_id=ANY($1::uuid[]) AND i.estado<>'cerrado'`,
            [ids(url)],
          )).rows;
          break;
        default:
          throw new Error(`Lectura inesperada en el puente de prioridad: ${tabla}`);
      }
      await conexion.query('COMMIT');
      return Response.json(filas);
    } catch (causa) {
      await conexion.query('ROLLBACK');
      throw causa;
    } finally {
      conexion.release();
    }
  };

  const cliente = createClient('http://127.0.0.1:1', 'fixture-hu43', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ejecutar },
  });
  return { cliente, peticiones };
}
