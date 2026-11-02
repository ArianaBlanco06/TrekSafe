// Pruebas SQL aisladas con PostgreSQL nativo. No lee .env ni usa el servicio local.
// Agregar --with-backend para comprobar el mismo contrato con memoria y SQL.
import assert from 'node:assert/strict';
import { execFile, fork, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flags = new Set();
let postgrestBin;
if (args[0] !== '--pg-bin' || !args[1]) throw new Error('Se requiere --pg-bin <carpeta bin de PostgreSQL>');
for (let i = 2; i < args.length; i++) {
  if (['--with-backend', '--with-browser'].includes(args[i])) flags.add(args[i]);
  else if (args[i] === '--postgrest' && args[i + 1]) postgrestBin = path.resolve(args[++i]);
  else throw new Error(`Argumento no reconocido: ${args[i]}`);
}
const withBrowser = flags.has('--with-browser');
const withBackend = flags.has('--with-backend') || withBrowser;
if (withBrowser && (!postgrestBin || !existsSync(postgrestBin))) throw new Error('Se requiere --postgrest <ejecutable oficial> con --with-browser');
if (withBackend && !existsSync(path.join(root, 'backend/node_modules/tsx'))) {
  throw new Error('Instalar las dependencias del backend antes de usar --with-backend');
}
const bin = path.resolve(args[1]);
const exe = (name) => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
for (const name of ['initdb', 'pg_ctl', 'psql']) {
  assert.ok(existsSync(exe(name)), `No se encontro ${name} en la carpeta indicada`);
}
const env = { ...process.env };
// Ningun PGHOST, PGSERVICE, PGOPTIONS o password heredado puede redirigir la prueba.
for (const key of Object.keys(env)) {
  if (key.toUpperCase().startsWith('PG')) delete env[key];
}
env.PGCLIENTENCODING = 'UTF8';
const workspace = await mkdtemp(path.join(tmpdir(), 'treksafe-hu32-sql-'));
const data = path.join(workspace, 'data');
const log = path.join(workspace, 'postgres.log');
const user = 'treksafe_hu32_test';
let started = false;
let count = 0;

function command(program, argv, input = '', options = {}) {
  if (path.basename(program).startsWith('pg_ctl')) {
    // En Windows el servidor puede heredar handles de las tuberias de pg_ctl.
    // No capturarlas: los logs del servidor ya se escriben con -l.
    return new Promise((resolve, reject) => {
      const child = spawn(program, argv, { env, windowsHide: true, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => code === 0 ? resolve('') : reject(
        new Error(`pg_ctl termino con codigo ${code}. Revisar ${log}`),
      ));
    });
  }
  return new Promise((resolve, reject) => {
    const child = execFile(program, argv, {
      env, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${path.basename(program)}: ${stderr || stdout || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
    child.stdin.on('error', () => {}); // El error principal se informa por el callback.
    child.stdin.end(input);
  });
}

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const assigned = server.address().port;
    server.close((error) => error ? reject(error) : resolve(assigned));
  });
});
const sql = (text) => command(exe('psql'), [
  '-X', '-h', '127.0.0.1', '-p', String(port), '-U', user, '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q',
], text);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonSql = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const plan = 'b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320';
const otherPlan = 'b1d0d5c0-8327-4af1-9cc1-2e83ae7e0321';
const readCall = (id = plan, actor = owner) =>
  `public.treksafe_consultar_puntos_ruta('${actor}', '${id}')`;
const saveCall = (points, version, id = plan, actor = owner) =>
  `public.treksafe_guardar_puntos_ruta('${actor}', '${id}', ${version === null ? 'NULL' : version}, ${jsonSql(points)})`;
const read = async (id = plan, actor = owner) =>
  JSON.parse(await sql(`SET ROLE service_role; SELECT coalesce(${readCall(id, actor)}, 'null'::jsonb);`));
const save = async (points, version, id = plan, actor = owner) =>
  JSON.parse(await sql(`SET ROLE service_role; SELECT ${saveCall(points, version, id, actor)};`));
const snapshot = async (id = plan) => JSON.parse(await sql(`
  SELECT jsonb_build_object('plan', to_jsonb(e), 'puntos', coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.orden) FROM public.puntos_ruta p WHERE p.expedicion_id=e.id
  ), '[]'::jsonb)) FROM public.expediciones e WHERE e.id='${id}';
`));
const point = (orden, values = {}) => ({
  id: randomUUID(), nombre: `Punto ${orden}`, latitud: -9.03, longitud: -77.6, orden, ...values,
});
async function test(name, fn) {
  await fn();
  count++;
  console.log(`OK ${count}: ${name}`);
}
async function waitForSleep(application) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const sleeping = await sql(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
      WHERE application_name=${literal(application)} AND wait_event='PgSleep');`);
    if (sleeping === 't') return;
    await delay(25);
  }
  throw new Error(`No se observo la barrera de concurrencia ${application}`);
}
async function invalidUnchanged(points, version, expected = 'datos_invalidos') {
  const before = await snapshot();
  const result = await save(points, version);
  assert.equal(result.tipo, expected);
  assert.deepEqual(await snapshot(), before);
  return result;
}

try {
  if (withBrowser) {
    console.log(`Validacion completa con ${process.version}`);
    const backendDir = path.join(root, 'backend');
    const frontendDir = path.join(root, 'frontend');
    for (const [dir, argv] of [
      [backendDir, ['node_modules/typescript/bin/tsc', '--noEmit']],
      [backendDir, ['node_modules/typescript/bin/tsc']],
      [frontendDir, ['node_modules/typescript/bin/tsc', '--noEmit']],
      [frontendDir, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.playwright.json']],
      [frontendDir, ['node_modules/vite/bin/vite.js', 'build']],
      [backendDir, ['--import', 'tsx', '--test', 'src/**/*.test.ts']],
      [frontendDir, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.ts']],
    ]) {
      console.log(await command(process.execPath, argv, '', { cwd: dir, env: { ...env, VITE_API_URL: '/api' } }));
    }
  }
  await command(exe('initdb'), ['-D', data, '-U', user, '--auth=trust', '--encoding=UTF8', '--locale=C']);
  await command(exe('pg_ctl'), ['-D', data, '-l', log, '-w', '-t', '30', 'start',
    '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC -c max_connections=15`]);
  started = true;
  console.log(`PostgreSQL aislado: ${await sql('SHOW server_version;')}`);
  console.log(`Directorio temporal: ${workspace}`);
  await sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
  // Esquema real del proyecto; solo se ejecuta en este cluster recien creado.
  await sql(await readFile(path.join(root, 'init_schema.sql'), 'utf8'));
  const migration = await readFile(path.join(root, 'backend/migrations/hu32_puntos_ruta.sql'), 'utf8');

  await test('precondicion de version: fallo sin crear ni modificar tablas', async () => {
    await assert.rejects(sql(migration), /HU32_VERSION_REQUERIDA/);
    assert.equal(await sql("SELECT to_regclass('public.puntos_ruta') IS NULL;"), 't');
    assert.equal(await sql('SELECT count(*) FROM public.usuarios;'), '2');
  });
  // Fixture exclusivo del test. No es una migracion de version para el equipo.
  await sql('ALTER TABLE public.expediciones ADD COLUMN version bigint NOT NULL DEFAULT 1;');
  await sql(migration);
  await sql(`INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol)
    VALUES ('${other}','otro@example.invalid','fixture','senderista');
    INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento)
    VALUES ('${other}','Otro ficticio','999999999','00000001');
    INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,coordenadas_inicio,
      coordenadas_fin,hora_inicio,hora_retorno_estimada,estado)
    VALUES ('${plan}','${owner}','Inicio','Destino','-9.04, -77.61','-9.01, -77.60',
      clock_timestamp()+interval '30 days',clock_timestamp()+interval '31 days','programada'),
      ('${otherPlan}','${other}','Otro inicio','Otro destino',NULL,NULL,
      clock_timestamp()+interval '30 days',clock_timestamp()+interval '31 days','programada');`);

  await test('consulta privada inicial y ausencia de puntos', async () => {
    const initial = await read();
    assert.equal(initial.expedicion.version, 1);
    assert.equal(initial.expedicion.editable, true);
    assert.deepEqual(initial.puntos, []);
    assert.equal(await read(plan, other), null);
    assert.equal(await read(randomUUID()), null);
  });

  const first = point(2, { nombre: '\t\u00a0 Mirador \u3000', latitud: -9.030126 });
  const second = point(1);
  await test('alta, orden, espacios Unicode y redondeo', async () => {
    const result = await save([first, second], 1);
    assert.equal(result.tipo, 'guardado');
    assert.equal(result.ruta.expedicion.version, 2);
    assert.deepEqual(result.ruta.puntos.map(p => p.id), [second.id, first.id]);
    assert.equal(result.ruta.puntos[1].nombre, 'Mirador');
    assert.equal(result.ruta.puntos[1].latitud, -9.03013);
  });
  await test('intercambiar posiciones conserva IDs y referencias existentes', async () => {
    await sql(`CREATE TABLE public.hu32_test_referencia(punto_id uuid REFERENCES public.puntos_ruta(id));
      INSERT INTO public.hu32_test_referencia VALUES ('${first.id}'),('${second.id}');`);
    const current = await read();
    const result = await save(current.puntos.map(p => ({ ...p, orden: 3 - p.orden })), current.expedicion.version);
    assert.equal(result.tipo, 'guardado');
    assert.deepEqual(result.ruta.puntos.map(p => p.id), [first.id, second.id]);
    assert.equal(await sql('SELECT count(*) FROM public.hu32_test_referencia;'), '2');
    await sql('DROP TABLE public.hu32_test_referencia;');
  });
  await test('guardado canonico identico conserva version y actualizado_en', async () => {
    const before = await snapshot();
    const current = await read();
    const result = await save(current.puntos.toReversed(), current.expedicion.version);
    assert.equal(result.tipo, 'guardado');
    assert.deepEqual(await snapshot(), before);
  });
  await test('hasta 20 puntos, limites geograficos y nombre de 100 puntos Unicode', async () => {
    const current = await read();
    const points = Array.from({ length: 20 }, (_, i) => point(i + 1));
    points[0] = { ...points[0], nombre: '\u{1f3d4}'.repeat(100), latitud: -18.5, longitud: -81.5 };
    points[19] = { ...points[19], latitud: 0.5, longitud: -68.5 };
    const result = await save(points, current.expedicion.version);
    assert.equal(result.tipo, 'guardado');
    assert.equal(result.ruta.puntos.length, 20);
    assert.equal([...result.ruta.puntos[0].nombre].length, 100);
  });

  const invalidCases = [
    ['21 puntos', () => Array.from({ length: 21 }, (_, i) => point(i + 1))],
    ['arreglo null', () => null],
    ['objeto en lugar de arreglo', () => ({})],
    ['punto null', () => [null]],
    ['nombre vacio tras trim', () => [point(1, { nombre: '\u00a0\t\uFEFF' })]],
    ['nombre de 101 caracteres', () => [point(1, { nombre: 'a'.repeat(101) })]],
    ['nombre ausente', () => { const p = point(1); delete p.nombre; return [p]; }],
    ['latitud como cadena', () => [point(1, { latitud: '-9.03' })]],
    ['latitud fuera antes de redondear', () => [point(1, { latitud: 0.50000001 })]],
    ['longitud fuera de limites', () => [point(1, { longitud: -82 })]],
    ['orden cero', () => [point(0)]],
    ['orden fraccionario', () => [point(1.5)]],
    ['salto de orden', () => [point(2)]],
    ['orden repetido', () => [point(1), point(1)]],
    ['ID repetido normalizado', () => { const p = point(1); return [p, { ...p, id: p.id.toUpperCase(), orden: 2 }]; }],
    ['ID mal formado', () => [point(1, { id: 'invalido' })]],
    ['propiedad desconocida', () => [point(1, { senderistaId: other })]],
  ];
  for (const [name, create] of invalidCases) {
    await test(`rechazo sin cambios: ${name}`, async () => {
      const current = await read();
      const result = await invalidUnchanged(create(), current.expedicion.version);
      assert.ok(Object.keys(result.detalles).length > 0);
    });
  }
  await test('version nula o fuera de rango', async () => {
    await invalidUnchanged([], null);
    await invalidUnchanged([], 9007199254740992n);
  });
  await test('ID de otra expedicion no se traslada ni revela datos', async () => {
    const foreign = point(1);
    assert.equal((await save([foreign], 1, otherPlan, other)).tipo, 'guardado');
    const foreignBefore = await snapshot(otherPlan);
    const current = await read();
    const result = await invalidUnchanged([foreign], current.expedicion.version);
    assert.ok(!JSON.stringify(result).includes(otherPlan));
    assert.deepEqual(await snapshot(otherPlan), foreignBefore);
  });
  await test('plan ajeno e inexistente comparten rechazo', async () => {
    assert.deepEqual(await save([], 1, plan, other), { tipo: 'no_encontrado' });
    assert.deepEqual(await save([], 1, randomUUID()), { tipo: 'no_encontrado' });
  });
  await test('version obsoleta y respuesta perdida conservan la coleccion', async () => {
    const current = await read();
    await invalidUnchanged(current.puntos, current.expedicion.version - 1, 'version_obsoleta');
    assert.deepEqual((await read()).puntos, current.puntos);
  });
  await test('eliminar todos conserva todos los otros campos del plan', async () => {
    const before = await snapshot();
    const result = await save([], before.plan.version);
    assert.equal(result.tipo, 'guardado');
    assert.deepEqual(result.ruta.puntos, []);
    const after = await snapshot();
    const { version: oldVersion, actualizado_en: oldTime, ...oldFields } = before.plan;
    const { version: newVersion, actualizado_en: newTime, ...newFields } = after.plan;
    assert.deepEqual(newFields, oldFields);
    assert.equal(newVersion, oldVersion + 1);
    assert.ok(newTime >= oldTime);
  });
  await test('rechazo en progreso, alerta y completada con lectura disponible', async () => {
    for (const state of ['en_progreso', 'alerta', 'completada']) {
      await sql(`UPDATE public.expediciones SET estado='${state}' WHERE id='${plan}';`);
      const current = await read();
      assert.equal(current.expedicion.editable, false);
      await invalidUnchanged([point(1)], current.expedicion.version, 'expedicion_no_editable');
    }
    await sql(`UPDATE public.expediciones SET estado='programada' WHERE id='${plan}';`);
  });
  await test('hora alcanzada con estado programada', async () => {
    await sql(`UPDATE public.expediciones SET hora_inicio=clock_timestamp() WHERE id='${plan}';`);
    const current = await read();
    assert.equal(current.expedicion.editable, false);
    await invalidUnchanged([], current.expedicion.version, 'expedicion_ya_iniciada');
    await sql(`UPDATE public.expediciones SET hora_inicio=clock_timestamp()+interval '30 days' WHERE id='${plan}';`);
  });
  await test('fallo despues de modificar puntos revierte puntos, version y metadatos', async () => {
    await sql(`CREATE FUNCTION public.hu32_test_fallar() RETURNS trigger LANGUAGE plpgsql AS $t$
      BEGIN RAISE EXCEPTION 'HU32_FALLO_INYECTADO'; END; $t$;
      CREATE TRIGGER hu32_test_fallo BEFORE UPDATE ON public.expediciones
      FOR EACH ROW EXECUTE FUNCTION public.hu32_test_fallar();`);
    const before = await snapshot();
    await assert.rejects(save([point(1)], before.plan.version), /HU32_FALLO_INYECTADO/);
    assert.deepEqual(await snapshot(), before);
    await sql('DROP TRIGGER hu32_test_fallo ON public.expediciones; DROP FUNCTION public.hu32_test_fallar();');
  });
  await test('dos sesiones: un ganador, un conflicto y lectura consistente durante el guardado', async () => {
    const before = await read();
    const winnerPoints = [point(1, { nombre: 'Ganador' })];
    const transaction = sql(`SET application_name='hu32_test_ganador'; SET ROLE service_role; BEGIN;
      SELECT ${saveCall(winnerPoints, before.expedicion.version)}; SELECT pg_sleep(1.5); COMMIT;`);
    transaction.catch(() => {});
    await waitForSleep('hu32_test_ganador');
    assert.deepEqual(await read(), before);
    const competitor = save([point(1, { nombre: 'Competidor' })], before.expedicion.version);
    const [winnerText, loser] = await Promise.all([transaction, competitor]);
    assert.equal(JSON.parse(winnerText).tipo, 'guardado');
    assert.equal(loser.tipo, 'version_obsoleta');
    const after = await read();
    assert.deepEqual(after.puntos, winnerPoints);
    assert.equal(after.expedicion.version, before.expedicion.version + 1);
  });
  await test('hora evaluada despues de esperar un bloqueo', async () => {
    const current = await read();
    const holder = sql(`SET application_name='hu32_test_hora'; BEGIN;
      UPDATE public.expediciones SET hora_inicio=clock_timestamp()+interval '0.8 seconds' WHERE id='${plan}';
      SELECT pg_sleep(1.5); COMMIT;`);
    holder.catch(() => {});
    await waitForSleep('hu32_test_hora');
    const waiting = save([point(1)], current.expedicion.version);
    const [, result] = await Promise.all([holder, waiting]);
    assert.equal(result.tipo, 'expedicion_ya_iniciada');
    assert.deepEqual((await read()).puntos, current.puntos);
    await sql(`UPDATE public.expediciones SET hora_inicio=clock_timestamp()+interval '30 days' WHERE id='${plan}';`);
  });
  await test('colision concurrente de UUID entre planes revierte tambien las bajas', async () => {
    const before = await snapshot();
    const foreignBefore = await read(otherPlan, other);
    const shared = point(1);
    const holder = sql(`SET application_name='hu32_test_uuid'; SET ROLE service_role; BEGIN;
      SELECT ${saveCall([shared], foreignBefore.expedicion.version, otherPlan, other)};
      SELECT pg_sleep(1.5); COMMIT;`);
    holder.catch(() => {});
    await waitForSleep('hu32_test_uuid');
    const competitor = save([shared], before.plan.version);
    const [winnerText, rejected] = await Promise.all([holder, competitor]);
    assert.equal(JSON.parse(winnerText).tipo, 'guardado');
    assert.equal(rejected.tipo, 'datos_invalidos');
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await read(otherPlan, other)).puntos, [shared]);
  });
  await test('RLS y permisos: RPC exclusiva del servidor, sin DML directo', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        assert.equal(await sql(`SELECT has_table_privilege('${role}','public.puntos_ruta','${privilege}');`), 'f');
      }
      const expected = role === 'service_role' ? 't' : 'f';
      for (const signature of ['treksafe_consultar_puntos_ruta(uuid,uuid)', 'treksafe_guardar_puntos_ruta(uuid,uuid,bigint,jsonb)']) {
        assert.equal(await sql(`SELECT has_function_privilege('${role}','public.${signature}','EXECUTE');`), expected);
      }
      await assert.rejects(sql(`SET ROLE ${role}; SELECT * FROM public.puntos_ruta;`), /permission denied|permiso denegado/i);
    }
    assert.equal(await sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.puntos_ruta'::regclass;"), 't');
    await assert.rejects(sql(`SET ROLE anon; SELECT ${readCall()};`), /permission denied|permiso denegado/i);
  });
  if (withBackend) {
    env.TREKSAFE_HU32_TEST_PG = JSON.stringify({ host: '127.0.0.1', port, user, database: 'postgres' });
    console.log(await command(process.execPath, [
      '--import', 'tsx', '--test', 'src/application/services/contratoPuntosRuta.test.ts',
    ], '', { cwd: path.join(root, 'backend') }));
    console.log('Contrato del backend verificado con memoria y PostgreSQL temporal.');
  }
  if (withBrowser) {
    const controlToken = randomUUID();
    const child = fork(path.join(root, 'backend/scripts/hu32-integration-server.mjs'), [], {
      env: { ...env, TREKSAFE_HU32_CONTROL_TOKEN: controlToken, TREKSAFE_HU32_POSTGREST_BIN: postgrestBin,
        TREKSAFE_HU32_POSTGREST_LOG: path.join(workspace, 'postgrest.log'), TREKSAFE_HU32_PG_BIN: bin },
      execArgv: [], windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    try {
      const baseUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('La API temporal no inicio en 20 segundos')), 20_000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`La API temporal termino con codigo ${code}`)); });
        child.on('message', message => {
          if (message?.type === 'ready') { clearTimeout(timer); resolve(message.url); }
        });
      });
      assert.equal(new URL(baseUrl).hostname, '127.0.0.1');
      console.log(`API real y PWA aisladas: ${baseUrl}`);
      console.log(await command(process.execPath, [
        'node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.integration.config.ts',
      ], '', { cwd: path.join(root, 'frontend'), env: { ...env,
        TREKSAFE_HU32_BASE_URL: baseUrl, TREKSAFE_HU32_CONTROL_TOKEN: controlToken } }));
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        const timer = setTimeout(() => child.kill(), 10_000);
        if (child.connected) child.send('stop'); else child.kill();
        await exited;
        clearTimeout(timer);
      }
      console.log('API temporal y PostgREST detenidos.');
    }
  }
  console.log(`RESULTADO: ${count} comprobaciones SQL aprobadas. No se contacto Supabase.`);
} finally {
  if (started || existsSync(path.join(data, 'postmaster.pid'))) {
    await command(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']);
    console.log('Instancia temporal detenida. Se conservan sus archivos y logs para revision.');
  }
}
