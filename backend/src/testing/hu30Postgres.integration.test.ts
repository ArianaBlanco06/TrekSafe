import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { after, before, describe, it, type TestContext } from 'node:test';
import pg from 'pg';
import { crearPoolEquipoPruebas, contextoPostgresEquipoPruebas } from './contextoPostgresEquipoPruebas.js';
import { verificarContratoListasEquipoDAO } from './contratoListasEquipoDAO.js';

const conexionPruebas = process.env.HU30_TEST_DATABASE_URL;

describe('HU-30 PostgreSQL desechable', { skip: !conexionPruebas }, () => {
  let pool: pg.Pool;
  before(() => {
    pool = crearPoolEquipoPruebas(conexionPruebas!);
  });
  after(async () => { await pool?.end(); });

  async function preparar(t: TestContext) {
    return contextoPostgresEquipoPruebas(pool, t);
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
