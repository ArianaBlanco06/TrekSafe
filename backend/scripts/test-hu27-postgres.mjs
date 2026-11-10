// Suite SQL de HU-27 (018_hu27_cancelar_salida_futura.sql) en un PostgreSQL DESECHABLE.
//   node backend/scripts/test-hu27-postgres.mjs                     # Docker: postgres:18, 127.0.0.1:55434
//   node backend/scripts/test-hu27-postgres.mjs --pg-bin <carpeta>  # PostgreSQL instalado (initdb/pg_ctl)
// Aplica init_schema.sql y las migraciones 000 a 016 y 018, y ejecuta migrations/tests/hu27_cancelar_salida_futura.test.sql.
// No lee .env ni se conecta a nada que no sea 127.0.0.1/localhost con una base cuyo nombre contenga "desechable".
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const bin = args.includes('--pg-bin') ? path.resolve(args[args.indexOf('--pg-bin') + 1] ?? '') : null;
if (args.includes('--pg-bin') && !args[args.indexOf('--pg-bin') + 1]) throw new Error('Indicar la carpeta bin de PostgreSQL');
const env = { ...process.env };
for (const k of Object.keys(env)) if (k.toUpperCase().startsWith('PG')) delete env[k];
const PUERTO = 55434;
const BASE = 'treksafe_hu27_desechable';
const NOMBRE = 'treksafe-hu27-pg';
const password = randomBytes(12).toString('hex');
const MIGRACIONES = ['000_registro_migraciones', '001_hu29_plantillas_ruta', '002_hu26_version_y_eventos_plan', '003_hu26_rpc_editar_expedicion',
  '004_hu27_estado_cancelada', '005_hu27_rpc_cancelar_expedicion', '006_hu27_permiso_anonimizar_eventos', '007_hu35_rpc_ampliar_retorno',
  '20261101_hu30_listas_equipo', '20261101_hu30_operaciones_equipo', '008_hu31_preparacion_expedicion', '009_hu31_operaciones_preparacion',
  '010_hu32_puntos_ruta', '011_hu29_endurecer_permisos', '012_hu36_eventos_plan_solo_anexado', '013_hu37_avisos', '014_hu38_minutos_recordatorio',
  '016_hu34_avances_expedicion', '018_hu27_cancelar_salida_futura'];
const run = (f, a) => new Promise((res, rej) => execFile(f, a, { env, windowsHide: true, maxBuffer: 1 << 26 },
  (e, o, s) => (e ? rej(new Error(String(s || o || e.message).trim())) : res(String(o)))));
const exe = (n) => path.join(bin, process.platform === 'win32' ? `${n}.exe` : n);

let config; let detener = async () => {}; let cliente; const avisos = []; let ok = false;
try {
  if (bin) {
    const dir = await mkdtemp(path.join(tmpdir(), 'treksafe-hu27-'));
    if (path.resolve(dir).startsWith(root)) throw new Error('El clúster temporal no puede estar dentro del repositorio');
    detener = async () => { await run(exe('pg_ctl'), ['-D', `${dir}/data`, '-m', 'immediate', '-w', 'stop']).catch(() => {}); await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {}); };
    await run(exe('initdb'), ['-D', `${dir}/data`, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    await run(exe('pg_ctl'), ['-D', `${dir}/data`, '-l', `${dir}/log`, '-w', 'start', '-o', `-h 127.0.0.1 -p ${PUERTO} -c timezone=UTC`]);
    config = { host: '127.0.0.1', port: PUERTO, user: 'postgres', database: 'postgres' };
    const admin = new pg.Client(config); await admin.connect(); await admin.query(`CREATE DATABASE ${BASE}`); await admin.end();
    config.database = BASE;
  } else {
    await run('docker', ['rm', '-f', NOMBRE]).catch(() => {});
    await run('docker', ['run', '--rm', '-d', '--name', NOMBRE, '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${BASE}`, '-p', `127.0.0.1:${PUERTO}:5432`, 'postgres:18']);
    detener = () => run('docker', ['stop', '-t', '2', NOMBRE]).catch(() => {});
    config = { host: '127.0.0.1', port: PUERTO, user: 'postgres', password, database: BASE };
  }
  if (!['127.0.0.1', 'localhost'].includes(config.host) || !config.database.includes('desechable')) throw new Error('Destino no permitido');

  // La imagen reinicia el servidor al terminar de inicializarse: se exigen 3 SELECT 1 seguidos.
  for (let i = 0, seguidos = 0; seguidos < 3; i += 1) {
    if (i > 90) throw new Error('El servidor no se estabilizó');
    try {
      if (!cliente) { cliente = new pg.Client(config); cliente.on('error', () => { cliente = undefined; }); await cliente.connect(); }
      await cliente.query('SELECT 1'); seguidos += 1;
    } catch { seguidos = 0; cliente = undefined; }
    await delay(700);
  }
  console.log('PostgreSQL:', (await cliente.query('SELECT version() v')).rows[0].v);

  // Emulación de Supabase: roles (por clúster) y privilegios por defecto (por base).
  await cliente.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
  await cliente.query(await readFile(path.join(root, 'init_schema.sql'), 'utf8'));
  for (const m of MIGRACIONES) await cliente.query(await readFile(path.join(root, 'backend/migrations', `${m}.sql`), 'utf8'));
  console.log(`Esquema listo: init_schema.sql + ${MIGRACIONES.length} migraciones (hasta la 016 y la 018)\n`);

  cliente.on('notice', (n) => /^OK \d+:/.test(n.message) && avisos.push(n.message));
  let fallo = null;
  try { await cliente.query(await readFile(path.join(root, 'backend/migrations/tests/hu27_cancelar_salida_futura.test.sql'), 'utf8')); } catch (e) { fallo = e; }
  for (const a of avisos) console.log(`OK   SQL ${a.slice(3)}`);
  if (fallo) console.log(`FAIL tras ${avisos.length} casos: ${fallo.message}`);
  ok = !fallo && avisos.length === 10;
  console.log(`\nResumen HU-27: ${avisos.length} de 10 casos OK${fallo ? ', 1 falló' : ''}`);
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  await cliente?.end().catch(() => {});
  await detener();
}
process.exit(ok ? 0 : 1);
