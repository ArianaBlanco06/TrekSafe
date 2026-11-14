// Flujo real: navegador -> build PWA -> Express -> SDK Supabase -> PostgREST -> PostgreSQL.
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';

const puertoLibre = () => new Promise((resolve, reject) => {
  const s = net.createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? reject(e) : resolve(p)); });
});
const escuchar = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
});
async function cerrar(server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
function proxy(req, res, destino, ruta = req.url) {
  const r = request(new URL(ruta, destino), { method: req.method, headers: { ...req.headers, host: new URL(destino).host } }, respuesta => {
    res.writeHead(respuesta.statusCode, respuesta.headers);
    respuesta.on('aborted', () => res.destroy());
    respuesta.on('error', () => res.destroy());
    respuesta.pipe(res);
  });
  r.on('error', () => { if (res.headersSent) res.destroy(); else { res.writeHead(502); res.end(); } });
  res.on('close', () => { if (!res.writableFinished) r.destroy(); });
  req.pipe(r);
}

export async function probarFlujoCompletoHu47({ admin, config, carpeta, root, postgrest, actores, desde, hasta, hu48 = false }) {
  const evidencia = path.join(root, hu48 ? 'docs/evidencias/hu-48-local' : 'docs/evidencias/hu-47-local');
  await mkdir(evidencia, { recursive: true });
  const dist = path.join(root, 'frontend/dist');
  await readFile(path.join(dist, 'sw.js')); // Exige el build PWA real previo.
  await readFile(path.join(root, 'backend/dist/presentation/http/app.js'));
  const restPort = await puertoLibre();
  const restUrl = `http://127.0.0.1:${restPort}`;
  const claveRest = randomBytes(32).toString('hex');
  const password = randomBytes(24).toString('hex');
  await admin.query(`CREATE ROLE hu47_authenticator LOGIN NOINHERIT PASSWORD '${password}'`);
  await admin.query('GRANT service_role, anon, authenticated TO hu47_authenticator');
  const conf = path.join(carpeta, 'postgrest.conf');
  await writeFile(conf, [
    `db-uri = "postgresql://hu47_authenticator:${password}@127.0.0.1:${config.port}/${config.database}"`,
    'db-schemas = "public"', 'db-anon-role = "anon"', 'server-host = "127.0.0.1"',
    `server-port = ${restPort}`, 'db-pool = 5',
  ].join('\n'));
  const envRest = { ...process.env };
  for (const key of Object.keys(envRest)) if (/^(PG|PGRST)/i.test(key)) delete envRest[key];
  envRest.PGRST_JWT_SECRET = claveRest;
  let restChild, supabaseProxy, apiServer, webServer, browser;
  const casos = [];
  const caso = async (nombre, fn) => { await fn(); casos.push({ nombre, resultado: 'aprobado' }); console.log(`OK flujo completo: ${nombre}`); };
  try {
    const diagnostico = [];
    let errorInicio;
    restChild = spawn(postgrest, [conf], { env: envRest, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    restChild.on('error', e => { errorInicio = e; });
    restChild.stdout.on('data', b => diagnostico.push(String(b)));
    restChild.stderr.on('data', b => diagnostico.push(String(b)));
    for (let i = 0; ; i++) {
      if (errorInicio) throw errorInicio;
      const listo = await fetch(restUrl, { signal: AbortSignal.timeout(1000) }).then(r => r.ok, () => false);
      if (listo) break;
      if (i >= 80) throw new Error(`PostgREST no inició: ${diagnostico.join('').replaceAll(password, '[oculto]').replaceAll(claveRest, '[oculto]')}`);
      await delay(250);
    }
    const paginasCsv = [];
    // Solo adapta el prefijo /rest/v1 del SDK. No simula consultas ni respuestas.
    supabaseProxy = createServer((req, res) => {
      if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); res.end(); return; }
      if (hu48 && req.url.split('?')[0].endsWith('/rpc/treksafe_leer_pagina_incidentes_reporte')) {
        let cuerpo = '';
        req.on('data', b => { cuerpo += b; });
        req.on('end', () => { paginasCsv.push(JSON.parse(cuerpo)); });
      }
      proxy(req, res, restUrl, req.url.slice('/rest/v1'.length));
    });
    const supabaseUrl = await escuchar(supabaseProxy);
    Object.assign(process.env, {
      NODE_ENV: 'test', SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: jwt.sign({ role: 'service_role' }, claveRest, { expiresIn: '1h' }),
      JWT_SECRET: randomBytes(32).toString('hex'), MEDICAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      API_PREFIX: '/api', CRON_ENABLED: 'false', BREVO_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
    });
    delete process.env.DATABASE_URL;
    const importar = relative => import(pathToFileURL(path.join(root, 'backend/dist', relative)).href);
    const { createApp } = await importar('presentation/http/app.js');
    const { crearRutasRescate } = await importar('presentation/http/routes/rutasRescate.js');
    const { firmarToken } = await importar('infrastructure/security/jwt.js');
    const app = createApp({
      config: { apiPrefix: '/api', corsOrigin: '*' }, salud: () => ({ ok: true }),
      rutas: [{ prefijo: '/rescate', router: crearRutasRescate() }],
    });
    apiServer = createServer(app);
    const apiUrl = await escuchar(apiServer);
    const api = (actor, extra = '', rol = 'rescatista') => fetch(`${apiUrl}/api/rescate/estadisticas?fechaDesde=${desde.slice(0, 10)}&fechaHasta=${desde.slice(0, 10)}${extra}`, {
      headers: actor ? { Authorization: `Bearer ${firmarToken({ sub: actor, rol })}` } : {},
    });
    const esperado = { atendidos: 1212, abiertos: 3, cerrados: 1209 };
    const snapshot = () => admin.query(`SELECT md5(string_agg(row_to_json(i)::text, '' ORDER BY id)) AS s FROM public.incidentes i`).then(r => r.rows[0].s);
    const antes = await snapshot();
    if (!hu48) {
    await caso('Express y SDK contra PostgREST real devuelven el agregado completo para dos rescatistas', async () => {
      for (const actor of [actores.ana, actores.beto]) {
        const res = await api(actor);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        const body = await res.json();
        assert.deepEqual(body.resumen, esperado);
        assert.deepEqual(Object.keys(body).sort(), ['filtros', 'resumen']);
      }
    });
    await caso('autenticación, rol, perfil y filtros se rechazan por HTTP real', async () => {
      for (const [actor, extra, rol, estado] of [
        [null, '', 'rescatista', 401], [actores.senderista, '', 'senderista', 403],
        [actores.sinPerfil, '', 'rescatista', 403], [actores.ana, '&resultado=otro', 'rescatista', 400],
      ]) {
        const res = await api(actor, extra, rol);
        assert.equal(res.status, estado);
        assert.equal(res.headers.get('cache-control'), 'no-store');
      }
    });
    }
    const tipos = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    webServer = createServer(async (req, res) => {
      if (req.url.startsWith('/api/')) return proxy(req, res, apiUrl);
      try {
        const url = new URL(req.url, 'http://localhost');
        let archivo = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
        if (archivo !== dist && !archivo.startsWith(dist + path.sep)) { res.writeHead(400); res.end(); return; }
        if (!path.extname(archivo)) archivo = path.join(dist, 'index.html');
        const bytes = await readFile(archivo);
        res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(bytes);
      } catch { res.writeHead(404); res.end(); }
    });
    const webUrl = await escuchar(webServer);
    const { chromium } = await import(pathToFileURL(path.join(root, 'frontend/node_modules/@playwright/test/index.mjs')).href);
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
    if (hu48) {
      const { probarFlujoCompletoHu48 } = await import('./hu48-flujo-completo.mjs');
      await probarFlujoCompletoHu48({ admin, root, carpeta, evidencia, browser, apiUrl, webUrl, firmarToken, actores, desde, hasta, paginasCsv });
      return;
    }
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
    await contexto.addInitScript(({ actor, token }) => {
      if (!sessionStorage.getItem('treksafe:token')) {
        sessionStorage.setItem('treksafe:token', token);
        sessionStorage.setItem('treksafe:usuario', JSON.stringify({ id: actor, correoElectronico: 'ficticio@example.invalid', rol: 'rescatista', nombreCompleto: 'Ana ficticia' }));
      }
    }, { actor: actores.ana, token: firmarToken({ sub: actores.ana, rol: 'rescatista' }) });
    const page = await contexto.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.goto(`${webUrl}/rescatista/estadisticas`);
    const boton = page.getByRole('button', { name: 'Consultar estadísticas', exact: true });
    await boton.waitFor();
    await page.locator('#reporte-desde').fill(desde.slice(0, 10));
    await page.locator('#reporte-hasta').fill(desde.slice(0, 10));
    const aplicar = async () => {
      const pendiente = page.waitForResponse(r => new URL(r.url()).pathname === '/api/rescate/estadisticas');
      await boton.click();
      const res = await pendiente;
      await page.getByRole('button', { name: 'Consultar estadísticas', exact: true }).waitFor();
      return res;
    };
    await caso('PWA móvil: reporte completo, UTC y acceso desde la navegación', async () => {
      const res = await aplicar(); assert.equal(res.status(), 200);
      assert.equal((await page.getByTestId('conteo-atendidos').innerText()).replace(/\D/g, ''), '1212');
      assert.match(await page.getByTestId('rango-aplicado').innerText(), /Apertura.*UTC/);
      assert.equal(await page.getByRole('link', { name: 'Estadísticas', exact: true }).getAttribute('aria-current'), 'page');
      await page.screenshot({ path: path.join(evidencia, '01-resumen-movil.png'), fullPage: true });
    });
    await caso('zona, cierre y resultado actualizan los conteos y filtros visibles', async () => {
      await page.locator('#reporte-zona').fill('HUARAZ'); await aplicar();
      assert.equal(await page.getByTestId('conteo-atendidos').innerText(), '3');
      await page.locator('#reporte-criterio').selectOption('cierre');
      await page.locator('#reporte-resultado').selectOption('evacuado'); await aplicar();
      assert.equal(await page.getByTestId('conteo-atendidos').innerText(), '1');
      assert.equal(await page.getByTestId('conteo-abiertos').innerText(), '0');
      assert.equal(await page.getByTestId('conteo-cerrados').innerText(), '1');
      assert.match(await page.getByTestId('rango-aplicado').innerText(), /Cierre.*UTC/);
      await page.screenshot({ path: path.join(evidencia, '02-cierre-y-resultado.png'), fullPage: true });
    });
    await caso('conjunto vacío conserva filtros y tres ceros', async () => {
      await page.locator('#reporte-zona').fill('No existe'); await aplicar();
      await page.getByText('No hay incidentes que coincidan con estos filtros.', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('conteo-atendidos').innerText(), '0');
      await page.screenshot({ path: path.join(evidencia, '03-sin-coincidencias.png'), fullPage: true });
    });
    await caso('un rango invertido se rechaza sin sustituir el último reporte', async () => {
      await page.locator('#reporte-desde').fill(hasta.slice(0, 10));
      await boton.click();
      await page.getByText('La fecha inicial debe ser anterior o igual a la fecha final.', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('conteo-atendidos').innerText(), '0');
      await page.locator('#reporte-desde').fill(desde.slice(0, 10));
    });
    await caso('fallo real de persistencia y reintento conservan el resultado correcto', async () => {
      await page.locator('#reporte-zona').fill('Huaraz');
      await page.locator('#reporte-resultado').selectOption(''); await aplicar();
      const firma = 'public.treksafe_consultar_estadisticas_incidentes(uuid,timestamptz,timestamptz,text,text,text)';
      await admin.query(`REVOKE EXECUTE ON FUNCTION ${firma} FROM service_role`);
      try {
        await page.locator('#reporte-zona').fill('Cusco');
        const res = await aplicar(); assert.equal(res.status(), 500);
        await page.getByText('Se conserva la última consulta correcta con los filtros que aparecen abajo.', { exact: true }).waitFor();
        assert.equal(await page.getByTestId('conteo-atendidos').innerText(), '2');
      } finally { await admin.query(`GRANT EXECUTE ON FUNCTION ${firma} TO service_role`); }
      await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
      await page.getByText('No hay incidentes que coincidan con estos filtros.', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('conteo-atendidos').innerText(), '0');
    });
    await caso('320 px y escritorio no generan desbordamiento horizontal', async () => {
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 850 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        if (width === 320) assert.ok(await page.locator('#reporte-desde').evaluate(e => e.clientWidth >= 200));
      }
      await page.setViewportSize({ width: 320, height: 700 });
      await page.screenshot({ path: path.join(evidencia, '04-pantalla-320px.png'), fullPage: true });
    });
    await caso('worker PWA activo, sin respuestas de estadísticas almacenadas ni fallback offline', async () => {
      await page.evaluate(async () => {
        const registro = await navigator.serviceWorker.ready;
        if (!registro.active) throw new Error('Worker no activo');
      });
      const enCache = await page.evaluate(async () => {
        for (const nombre of await caches.keys()) for (const r of await (await caches.open(nombre)).keys()) {
          if (new URL(r.url).pathname === '/api/rescate/estadisticas') return true;
        }
        return false;
      });
      assert.equal(enCache, false);
      await contexto.setOffline(true);
      await boton.click();
      await page.getByText('No se pudieron actualizar las estadísticas. Revisa tu conexión e inténtalo nuevamente.', { exact: true }).waitFor();
      await contexto.setOffline(false);
    });
    await caso('sin errores de JavaScript y sin modificaciones por consultas', async () => {
      assert.deepEqual(errores, []);
      assert.equal(await snapshot(), antes);
    });
    await writeFile(path.join(evidencia, 'resultado-integracion.json'), JSON.stringify({
      historia: 'HU-47', ejecutadoEn: new Date().toISOString(),
      entorno: 'PostgreSQL desechable local + PostgREST real + SDK Supabase + Express + build PWA + Edge',
      datos: 'ficticios', supabaseDevModificado: false, reporteEsperado: esperado, casos,
    }, null, 2) + '\n');
    console.log(`${casos.length}/${casos.length} escenarios del flujo completo aprobados. Evidencia: docs/evidencias/hu-47-local`);
  } finally {
    await browser?.close();
    await cerrar(webServer); await cerrar(apiServer); await cerrar(supabaseProxy);
    if (restChild && restChild.exitCode === null) {
      const fin = new Promise(resolve => restChild.once('exit', resolve));
      restChild.kill(); await fin;
    }
  }
}
