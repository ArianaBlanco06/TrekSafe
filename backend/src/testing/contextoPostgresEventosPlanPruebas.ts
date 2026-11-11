import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import pg from 'pg';
import type { NuevoEventoPlan } from '../domain/repositories/IEventosPlanDAO.js';
import { EventosPlanDAOSupabase } from '../infrastructure/repositories/EventosPlanDAOSupabase.js';
import { PropiedadExpedicionSupabase } from '../infrastructure/repositories/PropiedadExpedicionSupabase.js';
import { clienteSupabaseLecturaPostgresPruebas } from './clienteSupabaseLecturaPostgresPruebas.js';
import type { ContextoContratoLectorEventosPlan } from './contratoLectorEventosPlan.js';

/** Solo las bases locales desechables de HU-36 o DEP-04. */
export function crearPoolEventosPlanPruebas(conexion: string): pg.Pool {
  const url = new URL(conexion);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)
      || !['/treksafe_hu36_test', '/treksafe_dep108_desechable'].includes(url.pathname)) {
    throw new Error('Estas pruebas requieren una base local desechable llamada treksafe_hu36_test o treksafe_dep108_desechable.');
  }
  return new pg.Pool({ connectionString: conexion, max: 5 });
}

/** Ejecuta sentencias como service_role dentro de una transacción confirmada. */
export async function comoServiceRole(pool: pg.Pool, sentencias: (cliente: pg.PoolClient) => Promise<void>): Promise<void> {
  const conexion = await pool.connect();
  try {
    await conexion.query('BEGIN');
    await conexion.query('SET LOCAL ROLE service_role');
    await sentencias(conexion);
    await conexion.query('COMMIT');
  } catch (error) {
    await conexion.query('ROLLBACK');
    throw error;
  } finally {
    conexion.release();
  }
}

export async function contextoPostgresEventosPlanPruebas(pool: pg.Pool, t: TestContext) {
  const senderistaA = randomUUID();
  const senderistaB = randomUUID();
  const expedicionA = randomUUID();
  const expedicionB = randomUUID();
  // Borrar las cuentas elimina expediciones y eventos por cascada (permitida por la 012).
  t.after(async () => {
    await pool.query('DELETE FROM public.usuarios WHERE id = ANY($1::uuid[])', [[senderistaA, senderistaB]]);
  });
  for (const [usuario, expedicion] of [[senderistaA, expedicionA], [senderistaB, expedicionB]]) {
    await pool.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
      [usuario, `${usuario}@example.invalid`, 'fixture-no-login', 'senderista']);
    await pool.query('INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,$2,$3,$4)',
      [usuario, 'Prueba HU-36', '+51900000036', usuario.slice(0, 20)]);
    await pool.query(`INSERT INTO public.expediciones
      (id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada)
      VALUES($1,$2,'Inicio ficticio','Destino ficticio',NOW()+INTERVAL '1 day',NOW()+INTERVAL '2 days')`, [expedicion, usuario]);
  }
  const cliente = clienteSupabaseLecturaPostgresPruebas(pool);

  async function sembrar(instantes: NuevoEventoPlan[][]): Promise<void> {
    for (const [indice, grupo] of instantes.entries()) {
      // now() es constante dentro de la transacción: el grupo comparte instante.
      if (indice > 0) await pool.query('SELECT pg_sleep(0.002)');
      await comoServiceRole(pool, async (conexion) => {
        for (const e of grupo) {
          await conexion.query(`INSERT INTO public.eventos_plan
            (expedicion_id,senderista_id,tipo,actor_id,version_resultante,cambios,motivo,operacion_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [e.expedicionId, e.senderistaId, e.tipo, e.actorId, e.versionResultante, JSON.stringify(e.cambios), e.motivo, e.operacionId]);
        }
      });
    }
  }

  const contexto: ContextoContratoLectorEventosPlan = {
    lector: new EventosPlanDAOSupabase(cliente), senderistaA, senderistaB, expedicionA, expedicionB, sembrar,
  };
  return { ...contexto, propiedad: new PropiedadExpedicionSupabase(cliente) };
}
