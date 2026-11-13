// Desde backend, con Node 22 y PostgreSQL instalado en PATH.
// node --import tsx scripts/test-hu43-integracion.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin"
// El clúster vive en TEMP y el navegador consulta la API local mediante Vite.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
import pg from 'pg';
import { iniciarApi } from '../src/api.ts';
import { createApp } from '../src/presentation/http/app.ts';
import { crearRutasRescate } from '../src/presentation/http/routes/rutasRescate.ts';
import { ServicioRescate } from '../src/application/services/servicioRescate.ts';
import { RepositorioRescate } from '../src/infrastructure/repositories/RepositorioRescate.ts';
import { IncidenteDAOSupabase } from '../src/infrastructure/repositories/IncidenteDAOSupabase.ts';
import { BitacoraIncidenteDAOSupabase } from '../src/infrastructure/repositories/BitacoraIncidenteDAOSupabase.ts';
import { AsignarResponsable } from '../src/application/use-cases/AsignarResponsable.ts';
import { ConsultarBitacoraIncidente } from '../src/application/use-cases/ConsultarBitacoraIncidente.ts';
import { AgregarEntradaBitacora } from '../src/application/use-cases/AgregarEntradaBitacora.ts';
import { clienteSupabaseRescatePostgresPruebas } from '../src/testing/clienteSupabaseRescatePostgresPruebas.ts';
import { firmarToken } from '../src/infrastructure/security/jwt.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'frontend');
const evidencia = path.join(root, 'docs/evidencias/hu-43-local');
const argumentos = process.argv.slice(2);
assert.ok(argumentos.length === 0 || (argumentos.length === 2 && argumentos[0] === '--pg-bin'), 'Argumentos admitidos: --pg-bin <carpeta>');
const bin = argumentos[1];
const ejecutable = (nombre) => bin ? path.join(bin, `${nombre}${process.platform === 'win32' ? '.exe' : ''}`) : nombre;
const entorno = { ...process.env };
for (const clave of Object.keys(entorno)) if (/^PG/i.test(clave)) delete entorno[clave];
const ejecutar = (nombre, args) => promisify(execFile)(ejecutable(nombre), args, { env: entorno, windowsHide: true, timeout: 30_000 });
Object.assign(process.env, {
  NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'fixture-hu43',
  JWT_SECRET: 'jwt-integracion-hu43-ficticio-000000000000', MEDICAL_ENCRYPTION_KEY: 'medico-hu43-ficticio-000000000000000', CRON_ENABLED: 'false',
});

const rescatista = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const senderista = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ids = [1, 2, 3, 4, 5, 6].map((numero) => `10000000-0000-4000-8000-${String(numero).padStart(12, '0')}`);
const carpeta = await mkdtemp(path.join(tmpdir(), 'treksafe-hu43-'));
assert.equal(path.dirname(path.resolve(carpeta)), path.resolve(tmpdir()));
const datos = path.join(carpeta, 'data');
let iniciado = false, pool, api, vite, navegador, fallo;
const casos = [];

async function puertoLibre() {
  const servidor = net.createServer();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const puerto = servidor.address().port;
  await new Promise((resolve) => servidor.close(resolve));
  return puerto;
}

async function caso(nombre, verificar) {
  await verificar();
  casos.push(nombre);
  console.log(`OK ${nombre}`);
}

async function sembrar() {
  await pool.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`);
  for (const archivo of ['init_schema.sql', 'backend/migrations/000_registro_migraciones.sql',
    'backend/migrations/002_hu26_version_y_eventos_plan.sql', 'backend/migrations/017_hu39_asumir_coordinacion.sql']) {
    await pool.query(await readFile(path.join(root, archivo), 'utf8'));
  }
  await pool.query(`INSERT INTO usuarios(id,correo_electronico,hash_contrasena,rol) VALUES
    ($1,'rescate-hu43@example.invalid','fixture-no-login','rescatista'),($2,'senderista-hu43@example.invalid','fixture-no-login','senderista')`, [rescatista, senderista]);
  await pool.query("INSERT INTO perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,'Senderista HU-43','900000043','HU43LOCAL')", [senderista]);
  await pool.query("INSERT INTO registros_institucionales_rescatista(institucion,numero_credencial,nombre_completo,fecha_nacimiento) VALUES('AGMP','HU43LOCAL','Ana Rescate','1990-01-01')");
  await pool.query("INSERT INTO perfiles_rescatista(usuario_id,numero_credencial,nombre_completo,fecha_nacimiento) VALUES($1,'HU43LOCAL','Ana Rescate','1990-01-01')", [rescatista]);
  const estados = ['alerta', 'alerta', 'alerta', 'en_progreso', 'programada', 'completada'];
  const destinos = ['Laguna Zona A', 'Mirador Zona A', 'Cumbre Zona B', 'Valle Zona B', 'Programada', 'Completada'];
  const retornos = ['10:00', '10:00', '11:00', '14:00', '15:00', '09:00'];
  for (let indice = 0; indice < ids.length; indice++) {
    await pool.query(`INSERT INTO expediciones(id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada,estado)
      VALUES($1,$2,'Inicio ficticio',$3,'2030-01-15T08:00:00Z',$4,$5)`,
    [ids[indice], senderista, destinos[indice], `2030-01-15T${retornos[indice]}:00Z`, estados[indice]]);
    const cantidad = [1, 1, 7, 0, 0, 0][indice];
    for (let acompanante = 0; acompanante < cantidad; acompanante++) {
      await pool.query('INSERT INTO acompanantes_expedicion(expedicion_id,nombre_acompanante) VALUES($1,$2)', [ids[indice], `Acompañante ficticio ${acompanante + 1}`]);
    }
  }
  await pool.query('SELECT public.treksafe_asumir_coordinacion($1,$2,$3)', [ids[0], rescatista, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
}

async function instantanea() {
  const resultado = {};
  for (const tabla of ['expediciones', 'acompanantes_expedicion', 'incidentes', 'bitacoras_rescate']) {
    resultado[tabla] = (await pool.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') AS filas FROM public.${tabla} t`)).rows[0].filas;
  }
  return resultado;
}

try {
  const puerto = await puertoLibre();
  await ejecutar('initdb', ['-D', datos, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
  await ejecutar('pg_ctl', ['-D', datos, '-l', path.join(carpeta, 'postgres.log'), '-w', 'start', '-o', `-h 127.0.0.1 -p ${puerto} -c timezone=UTC`]);
  iniciado = true;
  const config = { host: '127.0.0.1', port: puerto, user: 'postgres', database: 'treksafe_hu43_desechable' };
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.database, 'treksafe_hu43_desechable');
  const admin = new pg.Client({ ...config, database: 'postgres' });
  await admin.connect();
  try { await admin.query('CREATE DATABASE treksafe_hu43_desechable'); } finally { await admin.end(); }
  pool = new pg.Pool(config);
  await sembrar();
  const versionPg = (await pool.query('SHOW server_version')).rows[0].server_version;
  const anterior = await instantanea();
  const { cliente, peticiones } = clienteSupabaseRescatePostgresPruebas(pool);
  const incidentes = new IncidenteDAOSupabase(cliente);
  const bitacora = new BitacoraIncidenteDAOSupabase(cliente);
  const servicio = new ServicioRescate(new RepositorioRescate(cliente), {}, {}, {}, incidentes,
    { ahora: () => new Date('2030-01-15T12:00:00Z') });
  const rutas = crearRutasRescate({ servicio, asignarResponsable: new AsignarResponsable(incidentes),
    consultarBitacoraIncidente: new ConsultarBitacoraIncidente(bitacora), agregarEntradaBitacora: new AgregarEntradaBitacora(bitacora) });
  const app = createApp({ config: { apiPrefix: '/api', corsOrigin: '*' }, rutas: [{ prefijo: '/rescate', router: rutas }], salud: () => ({ estado: 'ok' }) });
  api = await iniciarApi({ port: 0, host: '127.0.0.1', verificarBase: async () => { await pool.query('SELECT 1'); }, crearAplicacion: () => app, cerrarRecursos: async () => {} });
  const origenApi = `http://127.0.0.1:${api.servidor.address().port}`;
  const token = firmarToken({ sub: rescatista, rol: 'rescatista' });
  const headers = { Authorization: `Bearer ${token}` };
  async function leer(endpoint, criterio) {
    const respuesta = await fetch(`${origenApi}/api/rescate/${endpoint}?criterio=${criterio}`, { headers });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    return (await respuesta.json())[endpoint];
  }
  await caso('API y PostgreSQL conservan el conjunto y desempatan por fecha e id', async () => {
    for (const endpoint of ['alertas', 'expediciones']) {
      const tiempo = await leer(endpoint, 'tiempo_excedido');
      const grupo = await leer(endpoint, 'tamano_grupo');
      const esperados = endpoint === 'alertas' ? ids.slice(0, 3) : ids.slice(0, 4);
      assert.deepEqual(tiempo.map((item) => item.expedicionId), esperados);
      assert.deepEqual(grupo.map((item) => item.expedicionId), [ids[2], ids[0], ids[1], ...esperados.slice(3)]);
      assert.deepEqual([...grupo].sort((a, b) => a.expedicionId.localeCompare(b.expedicionId)), tiempo);
      assert.equal(tiempo[0].coordinacion.nombreResponsable, 'Ana Rescate');
    }
  });
  await caso('el SDK y SQL cuentan participantes reales e incluyen al senderista individual', async () => {
    assert.deepEqual((await leer('expediciones', 'tiempo_excedido')).map((item) => item.numeroParticipantes), [2, 2, 8, 1]);
  });
  await caso('HTTP conserva permisos y rechaza criterios inválidos', async () => {
    assert.equal((await fetch(`${origenApi}/api/rescate/alertas`)).status, 401);
    const senderistaToken = firmarToken({ sub: senderista, rol: 'senderista' });
    assert.equal((await fetch(`${origenApi}/api/rescate/alertas`, { headers: { Authorization: `Bearer ${senderistaToken}` } })).status, 403);
    assert.equal((await fetch(`${origenApi}/api/rescate/alertas?criterio=desconocido`, { headers })).status, 400);
  });
  const { createServer } = await import(pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')).href);
  const { chromium } = await import(pathToFileURL(path.join(frontend, 'node_modules/playwright/index.mjs')).href);
  vite = await createServer({ root: frontend, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: await puertoLibre(), strictPort: true, proxy: { '/api': { target: origenApi, changeOrigin: true } } } });
  await vite.listen();
  const origenVista = vite.resolvedUrls.local[0];
  const opcionesBrowser = process.platform === 'win32' ? { channel: 'msedge' } : {};
  navegador = await chromium.launch({ ...opcionesBrowser, headless: true });
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await contexto.route('**/*', (ruta) =>
    new URL(ruta.request().url()).origin === new URL(origenVista).origin ? ruta.continue() : ruta.abort(),
  );
  await contexto.addInitScript(({ token, rescatista }) => {
    sessionStorage.setItem('treksafe:token', token);
    sessionStorage.setItem('treksafe:usuario', JSON.stringify({ id: rescatista, rol: 'rescatista', nombreCompleto: 'Ana Rescate' }));
  }, { token, rescatista });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (error) => errores.push(error.message));
  await pagina.goto(`${origenVista}rescatista/consola`, { waitUntil: 'domcontentloaded' });
  await pagina.locator('article').first().waitFor();
  await pagina.waitForFunction(() => document.querySelectorAll('article').length === 4);
  const destinos = () => pagina.locator('article > div:first-child p.font-semibold').allTextContents();
  await mkdir(evidencia, { recursive: true });
  await caso('consola y API muestran el orden por tiempo con coordinación vigente', async () => {
    assert.deepEqual(await destinos(), ['Laguna Zona A', 'Mirador Zona A', 'Cumbre Zona B', 'Valle Zona B']);
    assert.match(await pagina.locator('#descripcion-prioridad').innerText(), /tiempo excedido/);
    await pagina.screenshot({ path: path.join(evidencia, '01-tiempo-excedido.png'), fullPage: true });
  });
  await caso('consola y API cambian al tamaño del grupo conservando las cuatro expediciones', async () => {
    await pagina.getByLabel('Ordenar por', { exact: true }).selectOption('tamano_grupo');
    await pagina.waitForFunction(() => document.querySelector('#descripcion-prioridad')?.textContent.includes('Orden activo por participantes declarados'));
    assert.deepEqual(await destinos(), ['Cumbre Zona B', 'Laguna Zona A', 'Mirador Zona A', 'Valle Zona B']);
    await pagina.screenshot({ path: path.join(evidencia, '02-participantes.png'), fullPage: true });
  });
  await caso('la zona y el criterio se combinan y la vista cabe a 320 píxeles', async () => {
    await pagina.getByLabel('Filtrar por zona').fill('Zona A');
    await pagina.getByRole('button', { name: 'Buscar', exact: true }).click();
    await pagina.waitForFunction(() => document.querySelectorAll('article').length === 2);
    assert.deepEqual(await destinos(), ['Laguna Zona A', 'Mirador Zona A']);
    await pagina.setViewportSize({ width: 320, height: 844 });
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await pagina.screenshot({ path: path.join(evidencia, '03-zona-y-criterio.png'), fullPage: true });
  });
  await caso('las consultas y la consola conservan estados, plazos, acompañantes y coordinación persistidos', async () => {
    assert.deepEqual(await instantanea(), anterior);
    assert.ok(peticiones.every((peticion) => peticion.metodo === 'GET'));
    assert.deepEqual(errores, []);
  });
  await writeFile(path.join(evidencia, 'resultado-local.json'), JSON.stringify({ fecha: new Date().toISOString(), postgresql: versionPg,
    casosAprobados: casos, expedicionesSembradas: 6, alertasAbiertas: 3, expedicionesMonitor: 4,
    transporte: 'SDK Supabase con puente fetch a SQL local, ejecutado como service_role en transacciones de lectura',
    esquema: ['init_schema.sql', '000', '002', '017'], capturas: ['01-tiempo-excedido.png', '02-participantes.png', '03-zona-y-criterio.png'] }, null, 2) + '\n');
  console.log(`Resultado: ${casos.length} casos aprobados. Evidencia en docs/evidencias/hu-43-local.`);
} catch (causa) {
  fallo = causa;
} finally {
  const erroresCierre = [];
  for (const cerrar of [
    () => navegador?.close(),
    () => vite?.close(),
    async () => { api?.servidor.closeAllConnections(); await api?.detener(); },
    () => pool?.end(),
  ]) {
    try { await cerrar(); } catch (causa) { erroresCierre.push(causa); }
  }
  try {
    if (iniciado) await ejecutar('pg_ctl', ['-D', datos, '-m', 'immediate', '-w', 'stop']);
    assert.equal(path.dirname(path.resolve(carpeta)), path.resolve(tmpdir()));
    assert.ok(path.basename(carpeta).startsWith('treksafe-hu43-'));
    await rm(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (causa) { erroresCierre.push(causa); }
  if (erroresCierre.length) fallo = new AggregateError([...(fallo ? [fallo] : []), ...erroresCierre], 'Falló el cierre de la integración HU-43');
}
if (fallo) throw fallo;
