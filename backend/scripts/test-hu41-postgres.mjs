// PostgreSQL desechable para HU-41 (019_hu41_bitacora_incidente.sql).
//
// Uso (desde la raíz del repositorio):
//   node backend/scripts/test-hu41-postgres.mjs                    # Docker: postgres:18, puerto 55432
//   node backend/scripts/test-hu41-postgres.mjs --pg-bin <carpeta> # PostgreSQL instalado (initdb/pg_ctl)
//   Opcional: --port <n> (por defecto 55432)
//
// Seguridad: NO lee .env, DATABASE_URL ni SUPABASE_*, ignora las variables PG* del entorno
// y se niega a conectarse a cualquier host que no sea 127.0.0.1/localhost o a una base cuyo
// nombre no contenga "desechable". No puede tocar Supabase ni el DEV del equipo.
//
// Aplica init_schema.sql completo y las migraciones reales hasta la 018, más la 019. Después
// ejecuta backend/migrations/tests/hu41_bitacora_incidente.test.sql, las pruebas de
// concurrencia con sesiones reales (relevo y cierre simulados como superusuario) y la suite
// TypeScript hu41Postgres.integration.test.ts (HU41_TEST_DATABASE_URL apunta a este servidor).
// Detiene y borra el servidor al terminar, aunque falle.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migraciones = path.join(root, 'backend/migrations');

// ---------------------------------------------------------------------------
// Argumentos y reglas de seguridad
// ---------------------------------------------------------------------------
for (const clave of Object.keys(process.env)) {
  if (clave.toUpperCase().startsWith('PG')) delete process.env[clave];
}
const argumentos = process.argv.slice(2);
const valorDe = (bandera) => {
  const i = argumentos.indexOf(bandera);
  if (i < 0) return null;
  assert.ok(argumentos[i + 1] && !argumentos[i + 1].startsWith('--'), `Falta el valor de ${bandera}`);
  return argumentos[i + 1];
};
for (const a of argumentos) {
  if (a.startsWith('--') && !['--pg-bin', '--port'].includes(a)) throw new Error(`Argumento desconocido: ${a}`);
}
const binPg = valorDe('--pg-bin') ? path.resolve(valorDe('--pg-bin')) : null;
const puerto = Number(valorDe('--port') ?? 55432);
assert.ok(Number.isInteger(puerto) && puerto > 1024 && puerto < 65536 && puerto !== 5432, 'Puerto inválido (no usar 5432)');

const NOMBRE_CONTENEDOR = 'treksafe-hu41-pg';
const BASE = 'treksafe_desechable';
const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost']);

function exigirLocal(config) {
  if (!HOSTS_PERMITIDOS.has(config.host)) throw new Error(`Host no permitido: ${config.host}. Solo localhost/127.0.0.1.`);
  if (!String(config.database).includes('desechable')) throw new Error(`La base debe contener "desechable": ${config.database}`);
}

const env = { ...process.env };
const ejecutar = (archivo, args, opciones = {}) =>
  new Promise((resolve, reject) => {
    execFile(archivo, args, { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...opciones }, (error, stdout, stderr) =>
      error ? reject(new Error(String(stderr || stdout || error.message).trim())) : resolve(String(stdout)),
    );
  });

// ---------------------------------------------------------------------------
// Servidor desechable: Docker (por defecto) o --pg-bin
// ---------------------------------------------------------------------------
let config;
let detener = async () => {};

async function iniciarDocker() {
  const password = randomBytes(12).toString('hex');
  await ejecutar('docker', ['rm', '-f', NOMBRE_CONTENEDOR]).catch(() => {}); // resto de una ejecución anterior
  console.log(`Iniciando contenedor ${NOMBRE_CONTENEDOR} (postgres:18) en 127.0.0.1:${puerto}...`);
  await ejecutar(
    'docker',
    [
      'run', '--rm', '-d', '--name', NOMBRE_CONTENEDOR,
      '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${BASE}`,
      '-p', `127.0.0.1:${puerto}:5432`, 'postgres:18',
    ],
    { timeout: 5 * 60_000 },
  );
  detener = async () => {
    await ejecutar('docker', ['stop', '-t', '2', NOMBRE_CONTENEDOR]).catch(() => {}); // --rm lo elimina
  };
  const limite = Date.now() + 90_000;
  for (;;) {
    // Por TCP: el servidor temporal de inicialización de la imagen solo escucha por socket Unix.
    const listo = await ejecutar('docker', ['exec', NOMBRE_CONTENEDOR, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', BASE])
      .then(() => true, () => false);
    if (listo) break;
    if (Date.now() > limite) throw new Error('pg_isready no respondió en 90 s');
    await delay(1000);
  }
  return { host: '127.0.0.1', port: puerto, user: 'postgres', password, database: BASE };
}

async function iniciarBinarios() {
  const exe = (nombre) => path.join(binPg, process.platform === 'win32' ? `${nombre}.exe` : nombre);
  const carpeta = await mkdtemp(path.join(tmpdir(), 'treksafe-hu41-'));
  assert.ok(!path.resolve(carpeta).startsWith(root), 'El clúster temporal no puede estar dentro del repositorio');
  const datos = path.join(carpeta, 'data');
  detener = async () => {
    await ejecutar(exe('pg_ctl'), ['-D', datos, '-m', 'immediate', '-w', 'stop']).catch(() => {});
    await rm(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch((e) =>
      console.warn(`No se pudo borrar ${carpeta}: ${e.message}`),
    );
  };
  console.log(`Creando clúster temporal en ${carpeta} (puerto ${puerto})...`);
  await ejecutar(exe('initdb'), ['-D', datos, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
  await new Promise((resolve, reject) => {
    const hijo = spawn(
      exe('pg_ctl'),
      ['-D', datos, '-l', path.join(carpeta, 'postgres.log'), '-w', 'start', '-o', `-h 127.0.0.1 -p ${puerto} -c timezone=UTC -c max_connections=30`],
      { env, windowsHide: true, stdio: 'ignore' },
    );
    hijo.on('error', reject);
    hijo.on('exit', (codigo) => (codigo === 0 ? resolve() : reject(new Error(`pg_ctl start terminó con ${codigo}; ver ${carpeta}`))));
  });
  const admin = new pg.Client({ host: '127.0.0.1', port: puerto, user: 'postgres', database: 'postgres' });
  exigirLocal({ host: '127.0.0.1', database: BASE });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${BASE}`);
  await admin.end();
  return { host: '127.0.0.1', port: puerto, user: 'postgres', database: BASE };
}

// ---------------------------------------------------------------------------
// Preparación del esquema (como test-hu34-postgres.mjs)
// ---------------------------------------------------------------------------
// Solo se emulan los roles de Supabase y sus privilegios por defecto. Después se aplica
// init_schema.sql completo (borra y recrea el esquema: válido únicamente en este servidor
// desechable) y las migraciones reales hasta la 016, en el orden de migrations/README.md.
const EMULACION_ROLES = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;
const MIGRACIONES_PREVIAS = [
  '000_registro_migraciones.sql', '001_hu29_plantillas_ruta.sql', '002_hu26_version_y_eventos_plan.sql',
  '003_hu26_rpc_editar_expedicion.sql', '004_hu27_estado_cancelada.sql', '005_hu27_rpc_cancelar_expedicion.sql',
  '006_hu27_permiso_anonimizar_eventos.sql', '007_hu35_rpc_ampliar_retorno.sql',
  '20261101_hu30_listas_equipo.sql', '20261101_hu30_operaciones_equipo.sql',
  '008_hu31_preparacion_expedicion.sql', '009_hu31_operaciones_preparacion.sql', '010_hu32_puntos_ruta.sql',
  '011_hu29_endurecer_permisos.sql', '012_hu36_eventos_plan_solo_anexado.sql', '013_hu37_avisos.sql',
  '014_hu38_minutos_recordatorio.sql', '016_hu34_avances_expedicion.sql',
  '017_hu39_asumir_coordinacion.sql', '018_hu27_cancelar_salida_futura.sql',
];

// ---------------------------------------------------------------------------
// Utilidades de prueba
// ---------------------------------------------------------------------------
let total = 0;
let pasadas = 0;
const fallos = [];

async function caso(nombre, fn) {
  total += 1;
  try {
    await fn();
    pasadas += 1;
    console.log(`OK   ${nombre}`);
  } catch (error) {
    fallos.push({ nombre, mensaje: error.message });
    console.log(`FAIL ${nombre}\n     ${String(error.message).split('\n').join('\n     ')}`);
  }
}

async function abrirCliente(aplicacion) {
  exigirLocal(config);
  const cliente = new pg.Client({ ...config, application_name: aplicacion });
  await cliente.connect();
  await cliente.query('SET ROLE service_role'); // mismo rol con el que entra el backend
  return cliente;
}

// Escribe en la bitácora con la RPC real, como service_role. Devuelve { ok, r } o { ok:false, codigo, detalle }.
async function escribir(cliente, incidenteId, autorId, texto, corrigeEntradaId = null, operacionId = randomUUID()) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_agregar_entrada_bitacora($1, $2, $3, $4, $5) AS r', [
      incidenteId, autorId, texto, corrigeEntradaId, operacionId,
    ]);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    let detalle = null;
    try { detalle = error.detail ? JSON.parse(error.detail) : null; } catch { detalle = error.detail; }
    return { ok: false, codigo: error.message, detalle };
  }
}

// Conexión de superusuario (simula el relevo de HU-40 y el cierre de HU-42).
async function abrirSuper(aplicacion) {
  exigirLocal(config);
  const cliente = new pg.Client({ ...config, application_name: aplicacion });
  await cliente.connect();
  clientesAbiertos.push(cliente);
  return cliente;
}

let versionPg = '(no disponible)';
let admin; // superusuario, para fixtures y observación
const q = (...a) => admin.query(...a);

async function esperarBloqueo(aplicacion) {
  for (let i = 0; i < 150; i += 1) {
    const { rows } = await q(
      "SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'",
      [aplicacion],
    );
    if (rows.length > 0) return;
    await delay(20);
  }
  throw new Error(`No se observó a ${aplicacion} esperando un bloqueo`);
}

async function crearRescatista(nombre) {
  const id = randomUUID();
  const credencial = `CRED-${id.slice(0, 8)}`;
  await q('INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol) VALUES ($1, $2, $3, $4)', [
    id, `${id.slice(0, 8)}@example.invalid`, 'fixture', 'rescatista',
  ]);
  await q(
    'INSERT INTO registros_institucionales_rescatista (institucion, numero_credencial, nombre_completo, fecha_nacimiento) VALUES ($1, $2, $3, $4)',
    ['AGMP', credencial, nombre, '1990-01-01'],
  );
  await q(
    'INSERT INTO perfiles_rescatista (usuario_id, numero_credencial, nombre_completo, fecha_nacimiento) VALUES ($1, $2, $3, $4)',
    [id, credencial, nombre, '1990-01-01'],
  );
  return id;
}

let senderista;
async function crearAlerta(estado = 'alerta') {
  const id = randomUUID();
  await q(
    `INSERT INTO expediciones (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
     VALUES ($1, $2, 'Inicio', 'Destino', now() - interval '5 hours', now() - interval '2 hours', $3)`,
    [id, senderista, estado],
  );
  return id;
}

async function crearIncidente(responsableId) {
  const expedicion = await crearAlerta();
  const { rows } = await q(
    'INSERT INTO incidentes (expedicion_id, responsable_id, operacion_id) VALUES ($1, $2, $3) RETURNING id',
    [expedicion, responsableId, randomUUID()],
  );
  return rows[0].id;
}

const contarEntradas = async (incidenteId) =>
  (await q('SELECT count(*)::int AS n FROM entradas_bitacora_incidente WHERE incidente_id = $1', [incidenteId])).rows[0].n;

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
const clientesAbiertos = [];
const abrir = async (aplicacion) => {
  const c = await abrirCliente(aplicacion);
  clientesAbiertos.push(c);
  return c;
};

async function principal() {
  config = binPg ? await iniciarBinarios() : await iniciarDocker();
  exigirLocal(config);

  // El contenedor puede aceptar la conexión TCP unos instantes después de pg_isready.
  for (let intento = 0; ; intento += 1) {
    try {
      admin = new pg.Client({ ...config, application_name: 'hu41_admin' });
      await admin.connect();
      break;
    } catch (error) {
      await admin?.end().catch(() => {});
      if (intento >= 30) throw error;
      await delay(1000);
    }
  }
  clientesAbiertos.push(admin);

  versionPg = (await q('SELECT version() AS v')).rows[0].v;
  console.log(`\nPostgreSQL: ${versionPg}`);
  console.log(`Modo: ${binPg ? `--pg-bin ${binPg}` : 'Docker postgres:18'} · ${config.host}:${config.port}/${config.database}\n`);

  await q(EMULACION_ROLES);
  await q(await readFile(path.join(root, 'init_schema.sql'), 'utf8'));
  for (const archivo of [...MIGRACIONES_PREVIAS, '019_hu41_bitacora_incidente.sql']) {
    await q(await readFile(path.join(migraciones, archivo), 'utf8'));
  }
  console.log(`init_schema.sql y ${MIGRACIONES_PREVIAS.length} migraciones previas aplicados (hasta la 018), más la 019.
`);

  // --- Suite SQL de una sola sesión ---------------------------------------
  console.log('== Suite SQL (migrations/tests/hu41_bitacora_incidente.test.sql) ==');
  const sql = await readFile(path.join(migraciones, 'tests/hu41_bitacora_incidente.test.sql'), 'utf8');
  const casosSql = [];
  const clienteSql = new pg.Client({ ...config, application_name: 'hu41_sql' });
  exigirLocal(config);
  await clienteSql.connect();
  clientesAbiertos.push(clienteSql);
  clienteSql.on('notice', (aviso) => {
    if (/^OK \d+:/.test(aviso.message)) casosSql.push(aviso.message);
  });
  let errorSql = null;
  try {
    await clienteSql.query(sql);
  } catch (error) {
    errorSql = error;
  }
  for (const linea of casosSql) {
    total += 1;
    pasadas += 1;
    console.log(`OK   SQL ${linea.replace(/^OK /, '')}`);
  }
  if (errorSql) {
    total += 1;
    const mensaje = [errorSql.message, errorSql.where].filter(Boolean).join(' | ');
    fallos.push({ nombre: `SQL tras ${casosSql.length} casos`, mensaje });
    console.log(`FAIL SQL tras ${casosSql.length} casos\n     ${mensaje}`);
  } else if (casosSql.length !== 16) {
    total += 1;
    fallos.push({ nombre: 'SQL', mensaje: `Se esperaban 16 casos y se ejecutaron ${casosSql.length}` });
    console.log(`FAIL SQL: se esperaban 16 casos y se ejecutaron ${casosSql.length}`);
  }
  await clienteSql.end();

  // --- Concurrencia con sesiones reales -----------------------------------
  console.log('\n== Concurrencia con sesiones reales ==');
  await q(`INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol) VALUES ($1, 'senderista.js@example.invalid', 'fixture', 'senderista')`, [
    (senderista = randomUUID()),
  ]);
  await q(`INSERT INTO perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento) VALUES ($1, 'Senderista JS', '999999999', '00000099')`, [senderista]);
  const rescatistaA = await crearRescatista('Rescatista A');
  const rescatistaB = await crearRescatista('Rescatista B');
  const conexionA = await abrir('hu41_a');
  const conexionB = await abrir('hu41_b');
  // El relevo (HU-40) y el cierre (HU-42) se simulan como superusuario con su propio application_name.
  const relevo = await abrirSuper('hu41_relevo');

  await caso('(a) el relevo toma la fila primero: la escritura de A espera y luego recibe NO_ES_RESPONSABLE con el nuevo responsable', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await relevo.query('BEGIN');
    try {
      await relevo.query('SELECT id FROM incidentes WHERE id = $1 FOR UPDATE', [incidente]);
      await relevo.query('UPDATE incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidente, rescatistaB]);
      const pendiente = escribir(conexionA, incidente, rescatistaA, 'Nota de A durante el relevo');
      await esperarBloqueo('hu41_a');
      await relevo.query('COMMIT');
      const a = await pendiente;
      assert.equal(a.ok, false, JSON.stringify(a));
      assert.equal(a.codigo, 'NO_ES_RESPONSABLE');
      assert.equal(a.detalle.id, rescatistaB);
      assert.equal(await contarEntradas(incidente), 0);
    } finally {
      await relevo.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(b) A escribe primero: el UPDATE del relevo espera; la entrada de A queda con autor A y después A se rechaza y B escribe', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await conexionA.query('BEGIN');
    try {
      const primera = await escribir(conexionA, incidente, rescatistaA, 'Nota de A antes del relevo'); // FOR SHARE tomado
      assert.equal(primera.ok, true, JSON.stringify(primera));
      const pendiente = relevo.query('UPDATE incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidente, rescatistaB]);
      await esperarBloqueo('hu41_relevo');
      await conexionA.query('COMMIT');
      await pendiente;
      const { rows } = await q('SELECT autor_id FROM entradas_bitacora_incidente WHERE incidente_id = $1', [incidente]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].autor_id, rescatistaA);
      const a = await escribir(conexionA, incidente, rescatistaA, 'A ya no es responsable');
      assert.equal(a.codigo, 'NO_ES_RESPONSABLE');
      assert.equal(a.detalle.id, rescatistaB);
      const b = await escribir(conexionB, incidente, rescatistaB, 'B es el nuevo responsable');
      assert.equal(b.ok, true, JSON.stringify(b));
      assert.equal(await contarEntradas(incidente), 2);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(c) el cierre bloquea igual: A espera y luego recibe INCIDENTE_CERRADO; lo escrito antes del cierre se conserva', async () => {
    const incidente = await crearIncidente(rescatistaA);
    assert.equal((await escribir(conexionA, incidente, rescatistaA, 'Antes del cierre')).ok, true);
    await relevo.query('BEGIN');
    try {
      await relevo.query('SELECT id FROM incidentes WHERE id = $1 FOR UPDATE', [incidente]);
      await relevo.query("UPDATE incidentes SET estado = 'cerrado', cerrado_en = now(), version = version + 1 WHERE id = $1", [incidente]);
      const pendiente = escribir(conexionA, incidente, rescatistaA, 'Durante el cierre');
      await esperarBloqueo('hu41_a');
      await relevo.query('COMMIT');
      const a = await pendiente;
      assert.equal(a.codigo, 'INCIDENTE_CERRADO');
      assert.equal(await contarEntradas(incidente), 1);
    } finally {
      await relevo.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(d) 20 escrituras simultáneas del responsable desde 2 conexiones: 20 ids distintos y un orden total sin empates', async () => {
    const incidente = await crearIncidente(rescatistaA);
    const lote = async (conexion, prefijo) => {
      const resultados = [];
      for (let i = 0; i < 10; i += 1) resultados.push(await escribir(conexion, incidente, rescatistaA, `${prefijo} ${i}`));
      return resultados;
    };
    const [x, y] = await Promise.all([lote(conexionA, 'A'), lote(conexionB, 'B')]);
    const todos = [...x, ...y];
    assert.equal(todos.every((r) => r.ok), true, JSON.stringify(todos.filter((r) => !r.ok)));
    assert.equal(new Set(todos.map((r) => r.r.id)).size, 20);
    const { rows } = await q(
      'SELECT id, secuencia FROM entradas_bitacora_incidente WHERE incidente_id = $1 ORDER BY registrada_en, secuencia', [incidente]);
    assert.equal(rows.length, 20);
    assert.equal(new Set(rows.map((r) => r.secuencia)).size, 20);
    const otra = await q(
      'SELECT id FROM entradas_bitacora_incidente WHERE incidente_id = $1 ORDER BY registrada_en, secuencia', [incidente]);
    assert.deepEqual(otra.rows.map((r) => r.id), rows.map((r) => r.id)); // el orden es determinista
  });

  await caso('(e) el mismo operacionId a la vez desde 2 conexiones: ambas responden, una con repetido=false y otra con true, y hay una sola fila', async () => {
    const incidente = await crearIncidente(rescatistaA);
    const operacion = randomUUID();
    const [a, b] = await Promise.all([
      escribir(conexionA, incidente, rescatistaA, 'Misma operación', null, operacion),
      escribir(conexionB, incidente, rescatistaA, 'Misma operación', null, operacion),
    ]);
    assert.equal(a.ok && b.ok, true, JSON.stringify([a, b]));
    assert.equal(a.r.id, b.r.id);
    assert.equal([a, b].filter((x) => x.r.repetido === false).length, 1);
    assert.equal([a, b].filter((x) => x.r.repetido === true).length, 1);
    assert.equal(await contarEntradas(incidente), 1);
  });

  await caso('(f) un error forzado al insertar revierte todo: 0 entradas', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await q(`CREATE FUNCTION fallar_hu41() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HU41'; END$$;
             CREATE TRIGGER hu41_fallo BEFORE INSERT ON entradas_bitacora_incidente FOR EACH ROW EXECUTE FUNCTION fallar_hu41();`);
    try {
      const r = await escribir(conexionA, incidente, rescatistaA, 'No debe quedar');
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'FALLO_HU41');
    } finally {
      await q('DROP TRIGGER hu41_fallo ON entradas_bitacora_incidente; DROP FUNCTION fallar_hu41();');
    }
    assert.equal(await contarEntradas(incidente), 0);
  });

  // --- Suite TypeScript contra este Postgres (puente supabase-js -> pg) ----
  console.log('\n== Suite TypeScript (hu41Postgres.integration.test.ts) ==');
  await caso('contrato del DAO y casos de uso reales sobre Postgres (node --test)', async () => {
    const credenciales = config.password ? `postgres:${encodeURIComponent(config.password)}` : 'postgres';
    const url = `postgres://${credenciales}@127.0.0.1:${config.port}/${config.database}`;
    exigirLocal({ host: '127.0.0.1', database: config.database });
    const backend = path.join(root, 'backend');
    try {
      const salida = await ejecutar(
        process.execPath,
        ['--import', 'tsx', '--test', 'src/testing/hu41Postgres.integration.test.ts'],
        { cwd: backend, env: { ...env, HU41_TEST_DATABASE_URL: url }, timeout: 5 * 60_000 },
      );
      const resumen = salida.split('\n').filter((l) => /^# (tests|pass|fail|skipped)/.test(l)).join(' · ');
      console.log(`     ${resumen}`);
      assert.ok(!/# fail [1-9]/.test(salida), salida);
      assert.ok(!/# pass 0\b/.test(salida), 'La suite TS no ejecutó ningún caso');
    } catch (error) {
      throw new Error(`La suite TS falló:\n${String(error.message).slice(-3000)}`);
    }
  });
}

// ---------------------------------------------------------------------------
async function limpiar() {
  for (const c of clientesAbiertos) await c.end().catch(() => {});
  await detener();
}
process.once('SIGINT', () => { limpiar().finally(() => process.exit(130)); });

let errorFatal = null;
try {
  await principal();
} catch (error) {
  errorFatal = error;
} finally {
  await limpiar();
}

console.log('\n================ Resumen HU-41 ================');
console.log(`PostgreSQL: ${versionPg}`);
console.log(`Casos: ${total} · pasaron: ${pasadas} · fallaron: ${fallos.length}`);
for (const f of fallos) console.log(` - ${f.nombre}: ${f.mensaje}`);
if (errorFatal) console.log(`ERROR de preparación: ${errorFatal.message}`);
process.exit(errorFatal || fallos.length > 0 || total === 0 ? 1 : 0);
