import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { crearPoolEquipoPruebas } from './contextoPostgresEquipoPruebas.js';
import { contextoPostgresPreparacionPruebas } from './contextoPostgresPreparacionPruebas.js';
import { verificarContratoPreparacionExpedicionDAO } from './contratoPreparacionExpedicionDAO.js';
import { iniciarApiPreparacionHttpPruebas } from './apiPreparacionHttpPruebas.js';

const conexion = process.env.HU31_TEST_DATABASE_URL;

describe('HU-31 PostgreSQL local desechable', { skip: !conexion }, () => {
  let pool: pg.Pool;
  before(() => { pool = crearPoolEquipoPruebas(conexion!); });
  after(async () => { await pool?.end(); });

  verificarContratoPreparacionExpedicionDAO('Contrato de preparación: SDK y PostgreSQL real mediante puente fetch',
    (t) => contextoPostgresPreparacionPruebas(pool, t));

  async function esperarBloqueo(funcion: string): Promise<void> {
    for (let intento = 0; intento < 150; intento++) {
      const r = await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1) AS bloqueada`,
      [`SELECT public.${funcion}%`]);
      if (r.rows[0].bloqueada) return;
      await esperar(20);
    }
    assert.fail(`No se observó el bloqueo esperado de ${funcion}`);
  }

  it('recorre HTTP con JWT, SDK y SQL reales, persiste marcas y aísla las dos cuentas', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const api = await iniciarApiPreparacionHttpPruebas(t, c.dao);
    const ruta = `/${c.expedicionA}/equipo`;
    const tokenA = api.tokenPara(c.senderistaA);
    assert.equal((await api.pedir('GET', ruta, undefined, tokenA)).cuerpo.preparacion, null);
    const r = await api.pedir('POST', ruta, { listaId: c.listaA.id }, tokenA);
    assert.equal(r.estado, 201);
    const copia = r.cuerpo.preparacion!;
    assert.equal(copia.obligatoriosPendientes, 2);
    const marcada = await api.pedir('PATCH', `${ruta}/items/${copia.items[0].id}`, { preparado: true }, tokenA);
    assert.equal(marcada.estado, 200);
    assert.equal(marcada.cuerpo.preparacion?.obligatoriosPendientes, 1);
    assert.deepEqual((await api.pedir('GET', ruta, undefined, tokenA)).cuerpo, marcada.cuerpo);
    const b = await api.pedir('GET', ruta, undefined, api.tokenPara(c.senderistaB));
    assert.equal(b.estado, 404);
    const filas = await pool.query('SELECT preparado FROM public.items_preparacion_expedicion WHERE id=$1', [copia.items[0].id]);
    assert.equal(filas.rows[0].preparado, true);
  });

  it('espera la edición de HU-30 y copia la nueva versión completa de la lista', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const bloqueo = await pool.connect();
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM public.listas_equipo WHERE id=$1 FOR UPDATE', [c.listaA.id]);
      const pendiente = c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
      // Captura temprana: una falla durante la espera no genera un rechazo sin manejar.
      const resultado = pendiente.then((valor) => ({ valor }), (error: unknown) => ({ error }));
      await esperarBloqueo('treksafe_asociar_lista_expedicion');
      await bloqueo.query('SELECT public.treksafe_actualizar_lista_equipo($1,$2,$3)', [c.senderistaA, c.listaA.id,
        JSON.stringify({ nombre: 'Invierno', items: [{ nombre: 'Abrigo', obligatorio: true }] })]);
      await bloqueo.query('COMMIT');
      const final = await resultado;
      assert.ok('valor' in final);
      assert.equal(final.valor.nombreLista, 'Invierno');
      assert.deepEqual(final.valor.items.map((i) => i.nombre), ['Abrigo']);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
  });

  it('no crea una copia si se elimina la lista mientras la asociación espera', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const bloqueo = await pool.connect();
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('DELETE FROM public.listas_equipo WHERE id=$1', [c.listaA.id]);
      const rechazo = assert.rejects(c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id), {
        codigo: 'LISTA_EQUIPO_NO_ENCONTRADA',
      });
      await esperarBloqueo('treksafe_asociar_lista_expedicion');
      await bloqueo.query('COMMIT');
      await rechazo;
      assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
  });

  it('rechaza la asociación si el retorno completa la expedición antes de obtener su bloqueo', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const bloqueo = await pool.connect();
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM public.expediciones WHERE id=$1 FOR UPDATE', [c.expedicionA]);
      const rechazo = assert.rejects(c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id), {
        codigo: 'PREPARACION_NO_EDITABLE',
      });
      await esperarBloqueo('treksafe_asociar_lista_expedicion');
      await bloqueo.query("UPDATE public.expediciones SET estado='completada' WHERE id=$1", [c.expedicionA]);
      await bloqueo.query('COMMIT');
      await rechazo;
      assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
  });

  it('rechaza una marca si el cron cambia a alerta antes de liberarse la expedición', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await c.cambiarEstado(c.expedicionA, 'en_progreso');
    const bloqueo = await pool.connect();
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM public.expediciones WHERE id=$1 FOR UPDATE', [c.expedicionA]);
      const rechazo = assert.rejects(c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[0].id, true), {
        codigo: 'PREPARACION_NO_EDITABLE',
      });
      await esperarBloqueo('treksafe_establecer_item_preparado');
      await bloqueo.query("UPDATE public.expediciones SET estado='alerta' WHERE id=$1", [c.expedicionA]);
      await bloqueo.query('COMMIT');
      await rechazo;
      assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
  });

  it('un fallo SQL al copiar el segundo ítem revierte también la cabecera y permite reintentar', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    await pool.query(`CREATE FUNCTION public.hu31_fallo_copia_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.nombre='Cámara' THEN RAISE EXCEPTION 'Fallo ficticio de copia'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER hu31_fallo_copia BEFORE INSERT ON public.items_preparacion_expedicion
      FOR EACH ROW EXECUTE FUNCTION public.hu31_fallo_copia_prueba()`);
    try {
      await assert.rejects(c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id), {
        codigoEstado: 500, codigo: 'PERSISTENCIA_PREPARACION_FALLIDA',
      });
      assert.equal(await c.dao.obtener(c.senderistaA, c.expedicionA), null);
      const huerfanos = await pool.query(`SELECT count(*)::int AS total FROM public.items_preparacion_expedicion i
        LEFT JOIN public.preparaciones_expedicion p ON p.id=i.preparacion_id WHERE p.id IS NULL`);
      assert.equal(huerfanos.rows[0].total, 0);
    } finally {
      await pool.query('DROP TRIGGER hu31_fallo_copia ON public.items_preparacion_expedicion; DROP FUNCTION public.hu31_fallo_copia_prueba()');
    }
    assert.equal((await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id)).items.length, 3);
  });

  it('elimina preparación e ítems por cascada al eliminar expedición o cuenta', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await pool.query('DELETE FROM public.expediciones WHERE id=$1', [c.expedicionA]);
    const restante = await pool.query(`SELECT
      (SELECT count(*) FROM public.preparaciones_expedicion WHERE id=$1)::int AS cabeceras,
      (SELECT count(*) FROM public.items_preparacion_expedicion WHERE preparacion_id=$1)::int AS items`, [copia.id]);
    assert.deepEqual(restante.rows[0], { cabeceras: 0, items: 0 });
    const otra = await c.dao.asociarLista(c.senderistaA, c.otraExpedicionA, c.listaA.id);
    await pool.query('DELETE FROM public.usuarios WHERE id=$1', [c.senderistaA]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.items_preparacion_expedicion WHERE preparacion_id=$1', [otra.id])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.preparaciones_expedicion WHERE id=$1', [otra.id])).rows[0].n, 0);
  });

  it('permite completar el estado con obligatorios pendientes sin alterar el plan por preparar equipo', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const antes = (await pool.query('SELECT * FROM public.expediciones WHERE id=$1', [c.expedicionA])).rows[0];
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await c.dao.establecerPreparado(c.senderistaA, c.expedicionA, copia.items[1].id, true);
    assert.deepEqual((await pool.query('SELECT * FROM public.expediciones WHERE id=$1', [c.expedicionA])).rows[0], antes);
    await c.cambiarEstado(c.expedicionA, 'en_progreso');
    const retorno = await pool.query(`UPDATE public.expediciones SET estado='completada',actualizado_en=NOW()
      WHERE id=$1 AND senderista_id=$2 AND estado IN ('en_progreso','alerta') RETURNING estado`, [c.expedicionA, c.senderistaA]);
    assert.equal(retorno.rows[0].estado, 'completada');
    assert.equal((await c.dao.obtener(c.senderistaA, c.expedicionA))?.obligatoriosPendientes, 2);
  });

  it('niega el acceso directo y la RPC a clientes y mantiene RLS aun con un SELECT concedido temporalmente', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    const cliente = await pool.connect();
    try {
      for (const rol of ['anon', 'authenticated']) {
        for (const sql of [
          'SELECT * FROM public.preparaciones_expedicion',
          'SELECT * FROM public.items_preparacion_expedicion',
          'SELECT public.treksafe_obtener_preparacion(NULL,NULL)',
          'SELECT public.treksafe_asociar_lista_expedicion(NULL,NULL,NULL)',
          'SELECT public.treksafe_establecer_item_preparado(NULL,NULL,NULL,TRUE)',
        ]) {
          await cliente.query('BEGIN');
          await cliente.query(`SET LOCAL ROLE ${rol}`);
          await assert.rejects(cliente.query(sql), { code: '42501' });
          await cliente.query('ROLLBACK');
        }
        await cliente.query('BEGIN');
        await cliente.query(`GRANT SELECT ON public.preparaciones_expedicion,public.items_preparacion_expedicion TO ${rol}`);
        await cliente.query(`SET LOCAL ROLE ${rol}`);
        assert.deepEqual((await cliente.query('SELECT * FROM public.preparaciones_expedicion')).rows, []);
        assert.deepEqual((await cliente.query('SELECT * FROM public.items_preparacion_expedicion')).rows, []);
        await cliente.query('ROLLBACK');
      }
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });

  it('la RPC rechaza un booleano nulo sin depender de la validación TypeScript', async (t) => {
    const c = await contextoPostgresPreparacionPruebas(pool, t);
    const copia = await c.dao.asociarLista(c.senderistaA, c.expedicionA, c.listaA.id);
    await assert.rejects(pool.query('SELECT public.treksafe_establecer_item_preparado($1,$2,$3,NULL)',
      [c.senderistaA, c.expedicionA, copia.items[0].id]), { code: 'P0001', detail: 'PREPARADO_INVALIDO' });
    assert.deepEqual(await c.dao.obtener(c.senderistaA, c.expedicionA), copia);
  });
});
