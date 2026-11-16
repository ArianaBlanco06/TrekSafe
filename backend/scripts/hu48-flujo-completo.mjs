import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ENCABEZADOS = ['id', 'zona', 'fecha_apertura', 'fecha_cierre', 'estado', 'resultado'];
const FIRMA = 'public.treksafe_leer_pagina_incidentes_reporte(uuid,timestamptz,timestamptz,text,text,text,uuid,integer)';
function leerCsv(bytes) {
  assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
  const filas = []; let fila = [], valor = '', comillas = false;
  const texto = bytes.toString('utf8').slice(1);
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (comillas && texto[i + 1] === '"') { valor += '"'; i++; }
      else comillas = !comillas;
    } else if (!comillas && c === ',') { fila.push(valor); valor = ''; }
    else if (!comillas && c === '\r' && texto[i + 1] === '\n') { fila.push(valor); filas.push(fila); fila = []; valor = ''; i++; }
    else valor += c;
  }
  assert.equal(comillas, false); assert.deepEqual(fila, []); assert.equal(valor, '');
  assert.deepEqual(filas.shift(), ENCABEZADOS);
  assert.ok(filas.every(f => f.length === 6));
  return filas;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function probarFlujoCompletoHu48({ admin, root, carpeta, evidencia, browser, apiUrl, webUrl, firmarToken, actores, desde, hasta, paginasCsv }) {
  const casos = [], archivos = [];
  const caso = async (nombre, fn) => { await fn(); casos.push({ nombre, resultado: 'aprobado' }); console.log(`OK HU-48 completo: ${nombre}`); };
  const filtrosDia = { fechaDesde: desde.slice(0, 10), fechaHasta: desde.slice(0, 10), criterioFecha: 'apertura' };
  const solicitar = (csv, filtros = {}, actor = actores.ana, rol = 'rescatista') => fetch(
    `${apiUrl}/api/rescate/estadisticas${csv ? '.csv' : ''}?${new URLSearchParams({ ...filtrosDia, ...filtros })}`,
    { headers: actor ? { Authorization: `Bearer ${firmarToken({ sub: actor, rol })}` } : {} },
  );
  const obtenerCsv = async (filtros = {}, actor = actores.ana) => {
    const res = await solicitar(true, filtros, actor);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="incidentes-/);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, filas: leerCsv(bytes) };
  };
  // Se separan del día de volumen para conservar los conteos originales de HU-47.
  const especialDesde = new Date(Date.parse(desde) - 2 * 86400000).toISOString();
  const zonas = ['Áncash, "Quebrada sur"', 'Cordillera\r\nSector "Ñ"', '=1+2', ' +SUM(1,2)', '-1+2', '@SUM(1,2)', '＝1+2'];
  const especiales = new Map();
  for (const zona of zonas) {
    const expedicion = randomUUID(), incidente = randomUUID();
    await admin.query(`INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada,estado)
      VALUES($1,$2,'Inicio ficticio HU48',$3,$4::timestamptz-interval '2 hours',$4,'alerta')`, [expedicion, actores.senderista, zona, especialDesde]);
    await admin.query(`INSERT INTO public.incidentes(id,expedicion_id,responsable_id,operacion_id,abierto_en,cerrado_en,estado)
      VALUES($1,$2,$3,$4,$5,$5,'cerrado')`, [incidente, expedicion, actores.ana, randomUUID(), especialDesde]);
    especiales.set(incidente, zona);
  }
  const snapshot = async () => (await admin.query(`SELECT jsonb_build_object(
    'incidentes',(SELECT md5(string_agg(row_to_json(i)::text,'' ORDER BY id)) FROM public.incidentes i),
    'expediciones',(SELECT md5(string_agg(row_to_json(e)::text,'' ORDER BY id)) FROM public.expediciones e),
    'cierres',(SELECT md5(string_agg(row_to_json(c)::text,'' ORDER BY id)) FROM public.informes_cierre_incidente c),
    'bitacora',(SELECT md5(string_agg(row_to_json(b)::text,'' ORDER BY id)) FROM public.entradas_bitacora_incidente b)
  ) AS s`)).rows[0].s;
  const antes = await snapshot();
  const definicion = (await admin.query('SELECT pg_get_functiondef($1::regprocedure) AS d', [FIRMA])).rows[0].d;
  const inyectar = async cuerpo => {
    const modificada = definicion.replace(/\nBEGIN\s*\n/, `\nBEGIN\n${cuerpo}\n`);
    assert.notEqual(modificada, definicion, 'La inyección de prueba debe localizar BEGIN');
    await admin.query(modificada);
  };
  let volumen;
  await caso('API, DAO, SDK y PostgREST exportan 1205 ids reales en siete páginas estables', async () => {
    const inicio = paginasCsv.length;
    volumen = await obtenerCsv({ zona: 'Volumen' });
    assert.equal(volumen.filas.length, 1205);
    const esperados = (await admin.query(`SELECT i.id FROM public.incidentes i JOIN public.expediciones e ON e.id=i.expedicion_id
      WHERE e.lugar_fin='Volumen' AND i.abierto_en >= $1 AND i.abierto_en < $2 ORDER BY i.id`, [desde, hasta])).rows.map(f => f.id);
    assert.deepEqual(volumen.filas.map(f => f[0]), esperados);
    assert.equal(new Set(volumen.filas.map(f => f[0])).size, 1205);
    const traza = paginasCsv.slice(inicio);
    assert.equal(traza.length, 7);
    assert.ok(traza.every(p => p.p_limite === 200 && p.p_rescatista_id === actores.ana));
    assert.equal(traza[0].p_despues_de, null);
    for (let i = 1; i < traza.length; i++) assert.equal(traza[i].p_despues_de, volumen.filas[i * 200 - 1][0]);
    await writeFile(path.join(evidencia, 'exportacion-1205.csv'), volumen.bytes);
    archivos.push({ archivo: 'exportacion-1205.csv', filas: 1205, paginas: 7, sha256: hash(volumen.bytes) });
  });
  await caso('mismo alcance para dos rescatistas y conteos fieles a HU-47 para todos los filtros', async () => {
    assert.deepEqual((await obtenerCsv({ zona: 'Volumen' }, actores.beto)).bytes, volumen.bytes);
    for (const filtros of [
      {}, { criterioFecha: 'cierre' }, { zona: ' HUARAZ ' }, { zona: 'Ruta_50%' }, { zona: 'No existe' },
      ...['localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma'].map(resultado => ({ criterioFecha: 'cierre', resultado })),
    ]) {
      const resumen = await (await solicitar(false, filtros)).json();
      const { filas } = await obtenerCsv(filtros);
      assert.equal(filas.length, resumen.resumen.atendidos);
      assert.equal(filas.filter(f => f[4] !== 'cerrado').length, resumen.resumen.abiertos);
      assert.equal(filas.filter(f => f[4] === 'cerrado').length, resumen.resumen.cerrados);
    }
  });
  await caso('el CSV real conserva acentos/comillas/saltos y protege prefijos de fórmula', async () => {
    const r = await obtenerCsv({ fechaDesde: especialDesde.slice(0, 10), fechaHasta: especialDesde.slice(0, 10) });
    assert.equal(r.filas.length, 7);
    for (const fila of r.filas) {
      const zona = especiales.get(fila[0]); assert.ok(zona);
      const protegida = zonas.indexOf(zona) >= 2;
      assert.equal(fila[1], protegida ? `\t${zona}` : zona);
      assert.equal(fila[5], ''); // Cierre histórico sin informe.
    }
    await writeFile(path.join(evidencia, 'exportacion-caracteres.csv'), r.bytes);
    archivos.push({ archivo: 'exportacion-caracteres.csv', filas: 7, sha256: hash(r.bytes) });
  });
  await caso('401/403/400 reales se devuelven sin cabeceras de archivo ni campos sensibles', async () => {
    for (const [actor, rol, filtros, estado] of [
      [null, 'rescatista', {}, 401], [actores.senderista, 'senderista', {}, 403],
      [actores.sinPerfil, 'rescatista', { zona: 'No existe' }, 403],
      [actores.ana, 'rescatista', { resultado: 'otro' }, 400],
      [actores.ana, 'rescatista', { rescatistaId: actores.beto }, 400],
    ]) {
      const res = await solicitar(true, filtros, actor, rol);
      assert.equal(res.status, estado); assert.equal(res.headers.get('content-disposition'), null);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.ok(!(await res.text()).includes('@example.invalid'));
    }
  });
  await caso('fallo SQL inicial devuelve JSON 500 antes del CSV', async () => {
    await inyectar("RAISE EXCEPTION 'FALLO_INICIAL_PRUEBA_HU48';");
    try {
      const res = await solicitar(true, { zona: 'Volumen' });
      assert.equal(res.status, 500); assert.equal(res.headers.get('content-disposition'), null);
      assert.equal((await res.json()).codigo, 'REPORTE_NO_DISPONIBLE');
    } finally { await admin.query(definicion); }
  });

  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', acceptDownloads: true });
  await contexto.addInitScript(({ token, actor }) => {
    sessionStorage.setItem('treksafe:token', token);
    sessionStorage.setItem('treksafe:usuario', JSON.stringify({ id: actor, correoElectronico: 'ficticio@example.invalid', rol: 'rescatista', nombreCompleto: 'Ana ficticia' }));
  }, { token: firmarToken({ sub: actores.ana, rol: 'rescatista' }), actor: actores.ana });
  const page = await contexto.newPage(), errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.setDefaultTimeout(15000);
  const botonCsv = () => page.getByRole('button', { name: 'Descargar CSV', exact: true });
  await page.goto(`${webUrl}/rescatista/estadisticas`);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
  await botonCsv().waitFor();
  await page.locator('#reporte-desde').fill(desde.slice(0, 10));
  await page.locator('#reporte-hasta').fill(desde.slice(0, 10));
  const aplicar = async () => {
    const espera = page.waitForResponse(r => new URL(r.url()).pathname === '/api/rescate/estadisticas');
    await page.getByRole('button', { name: 'Consultar estadísticas', exact: true }).click();
    assert.equal((await espera).status(), 200);
    await page.getByRole('button', { name: 'Consultar estadísticas', exact: true }).waitFor();
    await botonCsv().waitFor();
  };
  let descargas = 0; page.on('download', () => { descargas++; });
  const descargar = async (nombre, reintento = false) => {
    const espera = page.waitForEvent('download');
    await page.getByRole('button', { name: reintento ? 'Reintentar descarga CSV' : 'Descargar CSV', exact: true }).click();
    const d = await espera; assert.equal(await d.failure(), null);
    const temporal = path.join(carpeta, nombre);
    await d.saveAs(temporal);
    return { nombre: d.suggestedFilename(), bytes: await readFile(temporal) };
  };
  await caso('navegador descarga 1205 filas idénticas a la API e ignora filtros sin aplicar', async () => {
    await page.locator('#reporte-zona').fill('Volumen'); await aplicar();
    await page.locator('#reporte-zona').fill('Filtro todavía sin aplicar');
    const archivo = await descargar('navegador-volumen.csv');
    assert.deepEqual(archivo.bytes, volumen.bytes);
    assert.equal(archivo.nombre, `incidentes-apertura-${desde.slice(0, 10)}_${desde.slice(0, 10)}.csv`);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await botonCsv().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidencia, '01-descarga-volumen.png'), fullPage: true });
  });
  await caso('filtros de cierre/resultado y conjunto vacío producen los CSV correspondientes', async () => {
    await page.locator('#reporte-zona').fill('Huaraz');
    await page.locator('#reporte-criterio').selectOption('cierre');
    await page.locator('#reporte-resultado').selectOption('evacuado'); await aplicar();
    const filas = leerCsv((await descargar('cierre.csv')).bytes);
    assert.equal(filas.length, 1); assert.equal(filas[0][4], 'cerrado'); assert.equal(filas[0][5], 'evacuado');
    await page.screenshot({ path: path.join(evidencia, '02-cierre-resultado.png'), fullPage: true });
    await page.locator('#reporte-zona').fill('No existe'); await aplicar();
    assert.deepEqual(leerCsv((await descargar('vacio.csv')).bytes), []);
  });
  await caso('fallo SQL en otra página corta el cuerpo, no ofrece archivo y el reintento funciona', async () => {
    await page.locator('#reporte-criterio').selectOption('apertura');
    await page.locator('#reporte-resultado').selectOption('');
    await page.locator('#reporte-zona').fill('Volumen'); await aplicar();
    await inyectar("IF p_despues_de IS NOT NULL THEN PERFORM pg_sleep(0.05); RAISE EXCEPTION 'FALLO_PAGINA_PRUEBA_HU48'; END IF;");
    try {
      let completo = false;
      try { const res = await solicitar(true, { zona: 'Volumen' }); await res.arrayBuffer(); completo = true; } catch { /* Cuerpo abortado esperado. */ }
      assert.equal(completo, false);
      const antesDescargas = descargas;
      await botonCsv().click();
      await page.getByText('No se pudo completar la descarga del CSV. Revisa tu conexión e inténtalo nuevamente.', { exact: true }).waitFor();
      assert.equal(descargas, antesDescargas);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: path.join(evidencia, '03-fallo-pagina.png') });
    } finally { await admin.query(definicion); }
    assert.deepEqual((await descargar('reintento.csv', true)).bytes, volumen.bytes);
  });
  await caso('actualizar el reporte cancela una lectura real pendiente sin ofrecer archivo tardío', async () => {
    await inyectar('IF p_despues_de IS NULL THEN PERFORM pg_sleep(0.4); END IF;');
    const antesDescargas = descargas, antesPaginas = paginasCsv.length;
    try {
      await botonCsv().click();
      for (let i = 0; paginasCsv.length === antesPaginas; i++) { assert.ok(i < 100); await delay(10); }
      await page.locator('#reporte-zona').fill('Huaraz'); await aplicar();
      await delay(600);
      assert.equal(descargas, antesDescargas);
      assert.match(await page.locator('[aria-label="Resumen de incidentes"]').innerText(), /Destino: Huaraz/);
    } finally { await admin.query(definicion); }
  });
  await caso('worker activo no almacena CSV; offline bloquea y reconectar no descarga', async () => {
    const cacheada = await page.evaluate(async () => {
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) {
        if (new URL(r.url).pathname === '/api/rescate/estadisticas.csv') return true;
      }
      return false;
    });
    assert.equal(cacheada, false);
    const antesDescargas = descargas, antesPaginas = paginasCsv.length;
    await contexto.setOffline(true);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Descargar CSV') && b.disabled));
    await contexto.setOffline(false);
    await delay(100);
    assert.equal(descargas, antesDescargas); assert.equal(paginasCsv.length, antesPaginas);
  });
  await caso('consultas no cambian datos y el navegador no registra errores JavaScript', async () => {
    assert.deepEqual(await snapshot(), antes); assert.deepEqual(errores, []);
  });
  await writeFile(path.join(evidencia, 'resultado-integracion.json'), JSON.stringify({
    historia: 'HU-48', ejecutadoEn: new Date().toISOString(),
    entorno: 'PostgreSQL 18 desechable + PostgREST 16.5 real + SDK Supabase + Express + build PWA + Edge con worker activo',
    datos: 'ficticios', supabaseDevModificado: false, columnas: ENCABEZADOS, archivos, casos,
    aperturaExcelComprobada: false,
  }, null, 2) + '\n');
  console.log(`${casos.length}/${casos.length} escenarios completos HU-48 aprobados. Evidencia: docs/evidencias/hu-48-local`);
  await contexto.close();
}
