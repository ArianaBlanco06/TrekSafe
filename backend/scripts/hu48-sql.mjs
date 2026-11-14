import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function probarSqlHu48({ admin, servicio, root, actores, desde, hasta }) {
  const sql = await readFile(path.join(root, 'backend/migrations/031_hu48_exportacion_incidentes.sql'), 'utf8');
  await admin.query(sql);
  let pasadas = 0;
  const caso = async (nombre, fn) => { await fn(); pasadas++; console.log(`OK HU-48: ${nombre}`); };
  const pagina = (actor = actores.ana, criterio = 'apertura', zona = null, resultado = null, cursor = null, limite = 200) => servicio.query(
    'SELECT public.treksafe_leer_pagina_incidentes_reporte($1,$2,$3,$4,$5,$6,$7,$8) AS r',
    [actor, desde, hasta, criterio, zona, resultado, cursor, limite],
  ).then(r => r.rows[0].r);
  const recorrer = async (actor, criterio, zona, resultado) => {
    const filas = []; let cursor = null, paginas = 0;
    for (;;) {
      const p = await pagina(actor, criterio, zona, resultado, cursor);
      paginas++; assert.ok(paginas < 50, 'El cursor debe avanzar');
      assert.ok(p.incidentes.length <= 200);
      for (const f of p.incidentes) {
        assert.ok(!cursor || f.id > cursor);
        filas.push(f); cursor = f.id;
      }
      if (!p.hayMas) return { filas, paginas };
    }
  };

  await caso('1205 filas de volumen recorren siete páginas, ordenadas y sin duplicados', async () => {
    const { filas, paginas } = await recorrer(actores.ana, 'apertura', 'Volumen', null);
    assert.equal(filas.length, 1205); assert.equal(paginas, 7);
    assert.equal(new Set(filas.map(f => f.id)).size, 1205);
    assert.deepEqual(filas.map(f => f.id), filas.map(f => f.id).sort());
    assert.ok(filas.every(f => JSON.stringify(Object.keys(f).sort()) === JSON.stringify(['abiertoEn', 'cerradoEn', 'estado', 'id', 'resultado', 'zona'])));
  });
  await caso('páginas y conteos HU-47 coinciden con apertura/cierre, zona y catálogo completo', async () => {
    for (const [criterio, zona, resultado] of [
      ['apertura', null, null], ['cierre', null, null], ['apertura', ' HUARAZ ', null],
      ['apertura', 'Ruta_50%', null], ['apertura', 'No existe', null],
      ...['localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma'].map(r => ['cierre', 'Huaraz', r]),
    ]) {
      const resumen = (await servicio.query('SELECT public.treksafe_consultar_estadisticas_incidentes($1,$2,$3,$4,$5,$6) AS r', [actores.ana, desde, hasta, criterio, zona, resultado])).rows[0].r;
      const { filas } = await recorrer(actores.ana, criterio, zona, resultado);
      assert.equal(filas.length, resumen.atendidos);
      assert.equal(filas.filter(f => f.estado !== 'cerrado').length, resumen.abiertos);
      assert.equal(filas.filter(f => f.estado === 'cerrado').length, resumen.cerrados);
    }
  });
  await caso('otro rescatista ve los mismos ids y los históricos conservan resultado nulo', async () => {
    const a = await recorrer(actores.ana, 'apertura', 'Huaraz', null);
    const b = await recorrer(actores.beto, 'apertura', 'Huaraz', null);
    assert.deepEqual(a.filas, b.filas);
    assert.ok(a.filas.some(f => f.estado === 'cerrado' && f.resultado === null));
    assert.ok(a.filas.some(f => f.resultado === 'evacuado'));
  });
  await caso('se valida el perfil también al continuar con un cursor', async () => {
    const p = await pagina();
    const cursor = p.incidentes.at(-1).id;
    for (const actor of [actores.sinPerfil, actores.senderista, null]) {
      await assert.rejects(pagina(actor, 'apertura', null, null, cursor), e => e.code === '42501' && e.message === 'RESCATISTA_NO_VALIDADO');
    }
    await admin.query("UPDATE public.usuarios SET rol='senderista' WHERE id=$1", [actores.ana]);
    try { await assert.rejects(pagina(actores.ana, 'apertura', null, null, cursor), e => e.code === '42501'); }
    finally { await admin.query("UPDATE public.usuarios SET rol='rescatista' WHERE id=$1", [actores.ana]); }
  });
  await caso('límites inválidos y filtros directos desconocidos se rechazan', async () => {
    for (const limite of [0, -1, 501, null]) await assert.rejects(pagina(actores.ana, 'apertura', null, null, null, limite), e => e.code === '22023');
    await assert.rejects(pagina(actores.ana, 'retorno'), e => e.code === '22023');
    await assert.rejects(pagina(actores.ana, 'apertura', null, 'otro'), e => e.code === '22023');
  });
  await caso('anon/authenticated sin EXECUTE, INVOKER, STABLE y search_path vacío', async () => {
    const firma = 'public.treksafe_leer_pagina_incidentes_reporte(uuid,timestamptz,timestamptz,text,text,text,uuid,integer)';
    for (const rol of ['anon', 'authenticated']) {
      await admin.query(`SET ROLE ${rol}`);
      try { await assert.rejects(admin.query('SELECT public.treksafe_leer_pagina_incidentes_reporte($1,$2,$3,$4)', [actores.ana, desde, hasta, 'apertura']), e => e.code === '42501'); }
      finally { await admin.query('RESET ROLE'); }
    }
    const p = (await admin.query('SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid=$1::regprocedure', [firma])).rows[0];
    assert.equal(p.prosecdef, false); assert.equal(p.provolatile, 's'); assert.ok(p.proconfig.includes('search_path=""'));
  });
  await caso('las páginas funcionan READ ONLY y no cambian los incidentes', async () => {
    const snapshot = () => admin.query("SELECT md5(string_agg(row_to_json(i)::text,'' ORDER BY id)) AS s FROM public.incidentes i").then(r => r.rows[0].s);
    const antes = await snapshot();
    await servicio.query('BEGIN READ ONLY');
    try { await recorrer(actores.ana, 'apertura', null, null); }
    finally { await servicio.query('ROLLBACK'); }
    assert.equal(await snapshot(), antes);
  });
  await caso('031 se registra una vez y rechaza una segunda aplicación', async () => {
    const registro = (await admin.query("SELECT * FROM public.treksafe_migraciones WHERE version='031'")).rows;
    assert.equal(registro.length, 1); assert.equal(registro[0].hu, 'HU-48');
    await assert.rejects(admin.query(sql), /031 ya está registrada/);
    await admin.query('ROLLBACK');
    assert.deepEqual((await admin.query("SELECT * FROM public.treksafe_migraciones WHERE version='031'")).rows, registro);
  });
  return pasadas;
}
