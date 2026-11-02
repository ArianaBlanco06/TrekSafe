import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import { after, before, describe, it, type TestContext } from 'node:test';
import pg from 'pg';
import { RepositorioListasEquipoSupabase } from '../infrastructure/repositories/RepositorioListasEquipoSupabase.js';
import { clienteSupabasePostgresPruebas } from './clienteSupabasePostgresPruebas.js';
import { verificarContratoListasEquipoDAO } from './contratoListasEquipoDAO.js';

const conexionPruebas = process.env.HU30_TEST_DATABASE_URL;

describe('HU-30 PostgreSQL desechable', { skip: !conexionPruebas }, () => {
  let pool: pg.Pool;
  before(() => {
    const url = new URL(conexionPruebas!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/treksafe_hu30_test') {
      throw new Error('Estas pruebas requieren una base local desechable llamada treksafe_hu30_test.');
    }
    pool = new pg.Pool({ connectionString: conexionPruebas, max: 5 });
  });
  after(async () => { await pool?.end(); });

  async function preparar(t: TestContext) {
    const senderistaA = randomUUID();
    const senderistaB = randomUUID();
    for (const id of [senderistaA, senderistaB]) {
      await pool.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
        [id, `${id}@example.invalid`, 'fixture-no-login', 'senderista']);
      await pool.query('INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,$2,$3,$4)',
        [id, 'Prueba HU-30', '+51900000001', id.slice(0, 20)]);
    }
    t.after(async () => { await pool.query('DELETE FROM public.usuarios WHERE id = ANY($1::uuid[])', [[senderistaA, senderistaB]]); });
    const dao = new RepositorioListasEquipoSupabase(clienteSupabasePostgresPruebas(pool));
    return { dao, senderistaA, senderistaB };
  }

  verificarContratoListasEquipoDAO('Contrato IListasEquipoDAO: SDK y PostgreSQL real mediante puente fetch', preparar);

  async function esperarEdicionBloqueada(): Promise<void> {
    for (let intento = 0; intento < 100; intento++) {
      const { rows } = await pool.query(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE 'SELECT public.treksafe_actualizar_lista_equipo%'
      ) AS bloqueada`);
      if (rows[0].bloqueada) return;
      await esperar(20);
    }
    assert.fail('La edición no llegó a esperar el bloqueo de PostgreSQL');
  }

  it('serializa ediciones concurrentes y rechaza ids que una edición anterior eliminó', async (t) => {
    const { dao, senderistaA } = await preparar(t);
    const lista = await dao.crear(senderistaA, { nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }] });
    const bloqueo = await pool.connect();
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM public.listas_equipo WHERE id=$1 FOR UPDATE', [lista.id]);
      const obsoleta = dao.actualizar(senderistaA, lista.id, { nombre: 'Obsoleta', items: lista.items });
      const rechazada = assert.rejects(obsoleta, { codigo: 'ITEM_NO_PERTENECE' });
      await esperarEdicionBloqueada();
      await bloqueo.query('SELECT public.treksafe_actualizar_lista_equipo($1,$2,$3)',
        [senderistaA, lista.id, JSON.stringify({ nombre: 'Vigente', items: [] })]);
      await bloqueo.query('COMMIT');
      await rechazada;
      const actual = await dao.buscarPorId(senderistaA, lista.id);
      assert.equal(actual?.nombre, 'Vigente');
      assert.deepEqual(actual?.items, []);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
  });

  it('no recrea una lista eliminada mientras una edición espera su bloqueo', async (t) => {
    const { dao, senderistaA } = await preparar(t);
    const lista = await dao.crear(senderistaA, { nombre: 'Montaña', items: [] });
    const bloqueo = await pool.connect();
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('DELETE FROM public.listas_equipo WHERE id=$1', [lista.id]);
      const pendiente = dao.actualizar(senderistaA, lista.id, { nombre: 'No recrear', items: [] });
      await esperarEdicionBloqueada();
      await bloqueo.query('COMMIT');
      assert.equal(await pendiente, null);
      assert.equal(await dao.buscarPorId(senderistaA, lista.id), null);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
  });
});
