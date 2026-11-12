// PostgreSQL desechable para HU-42 (025_hu42_cerrar_incidente.sql).
//
// Uso (desde la raíz del repositorio):
//   node backend/scripts/test-hu42-postgres.mjs                    # Docker: postgres:18, puerto 55432
//   node backend/scripts/test-hu42-postgres.mjs --pg-bin <carpeta> # PostgreSQL instalado (initdb/pg_ctl)
//   Opcional: --port <n> (por defecto 55432)
//
// Seguridad: NO lee .env, DATABASE_URL ni SUPABASE_*, ignora las variables PG* del entorno
// y se niega a conectarse a cualquier host que no sea 127.0.0.1/localhost o a una base cuyo
// nombre no contenga "desechable". No puede tocar Supabase ni el DEV del equipo.
//
// Aplica init_schema.sql completo y las migraciones reales hasta la 019 (más 015 y 022 a 024,
// de DEP-04) y después la 025. Ejecuta backend/migrations/tests/hu42_cerrar_incidente.test.sql
// (13 casos), la suite SQL de HU-41 como regresión (16 casos), pruebas de concurrencia con
// sesiones reales (el relevo de HU-40 se simula como superusuario) y la suite TypeScript
// hu42Postgres.integration.test.ts (HU42_TEST_DATABASE_URL apunta a este servidor).
// Cada expedición usa su propio senderista: DEP-04 (022) permite una sola expedición
// bloqueante por senderista. Detiene y borra el servidor al terminar, aunque falle.
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

const NOMBRE_CONTENEDOR = 'treksafe-hu42-pg';
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
  const carpeta = await mkdtemp(path.join(tmpdir(), 'treksafe-hu42-'));
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
// Preparación del esquema (como test-hu41-postgres.mjs)
// ---------------------------------------------------------------------------
// Solo se emulan los roles de Supabase y sus privilegios por defecto. Después se aplica
// init_schema.sql completo (borra y recrea el esquema: válido únicamente en este servidor
// desechable) y las migraciones reales en el orden de migrations/README.md.
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
  '014_hu38_minutos_recordatorio.sql', '015_hu45_outbox.sql', '016_hu34_avances_expedicion.sql',
  '017_hu39_asumir_coordinacion.sql', '018_hu27_cancelar_salida_futura.sql', '019_hu41_bitacora_incidente.sql',
  '022_dep108_crear_expedicion_atomica.sql', '023_dep108_avisos_transaccionales.sql',
  '024_dep108_vencimientos_outbox.sql',
];
const MIGRACION_HU42 = '025_hu42_cerrar_incidente.sql';
const CASOS_SQL_HU42 = 13;
const CASOS_SQL_HU41 = 16;

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

function resultadoError(error) {
  let detalle = null;
  try { detalle = error.detail ? JSON.parse(error.detail) : null; } catch { detalle = error.detail; }
  return { ok: false, codigo: error.code === '40P01' ? '40P01' : error.message, detalle };
}

// Cierra con la RPC real, como service_role. Devuelve { ok, r } o { ok:false, codigo, detalle }.
async function cerrar(cliente, incidenteId, rescatistaId, resultado, resumen, comandoId = randomUUID()) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_cerrar_incidente($1, $2, $3, $4, $5) AS r', [
      incidenteId, rescatistaId, resultado, resumen, comandoId,
    ]);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    return resultadoError(error);
  }
}

async function localizar(cliente, incidenteId, rescatistaId, operacionId = randomUUID()) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_marcar_incidente_localizado($1, $2, $3) AS r', [
      incidenteId, rescatistaId, operacionId,
    ]);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    return resultadoError(error);
  }
}

// Nota de la bitácora de HU-41 con su RPC real.
async function escribir(cliente, incidenteId, autorId, texto, operacionId = randomUUID()) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_agregar_entrada_bitacora($1, $2, $3, $4, $5) AS r', [
      incidenteId, autorId, texto, null, operacionId,
    ]);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    return resultadoError(error);
  }
}

// Conexión de superusuario (simula el relevo de HU-40).
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
  const credencial = `CRED-H42-${id.slice(0, 8)}`;
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

// DEP-04: una sola expedición bloqueante por senderista, así que cada alerta tiene el suyo.
async function crearSenderista() {
  const id = randomUUID();
  await q('INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol) VALUES ($1, $2, $3, $4)', [
    id, `s${id.slice(0, 8)}@example.invalid`, 'fixture', 'senderista',
  ]);
  await q(
    'INSERT INTO perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento) VALUES ($1, $2, $3, $4)',
    [id, 'Senderista JS', '999999999', id.slice(0, 20)],
  );
  return id;
}

async function crearAlerta(estado = 'alerta') {
  const id = randomUUID();
  const senderista = await crearSenderista();
  await q(
    `INSERT INTO expediciones (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
     VALUES ($1, $2, 'Inicio', 'Destino', now() - interval '5 hours', now() - interval '2 hours', $3)`,
    [id, senderista, estado],
  );
  return id;
}

// Incidente abierto (o localizado: el UPDATE lo hace el superusuario, como en las pruebas de HU-41).
async function crearIncidente(responsableId, estado = 'abierto') {
  const expedicion = await crearAlerta();
  const { rows } = await q(
    'INSERT INTO incidentes (expedicion_id, responsable_id, operacion_id) VALUES ($1, $2, $3) RETURNING id',
    [expedicion, responsableId, randomUUID()],
  );
  const id = rows[0].id;
  if (estado === 'localizado') await q("UPDATE incidentes SET estado = 'localizado', version = version + 1 WHERE id = $1", [id]);
  return id;
}

const contarInformes = async (incidenteId) =>
  (await q('SELECT count(*)::int AS n FROM informes_cierre_incidente WHERE incidente_id = $1', [incidenteId])).rows[0].n;
const contarCierres = async (incidenteId) =>
  (await q("SELECT count(*)::int AS n FROM entradas_bitacora_incidente WHERE incidente_id = $1 AND tipo = 'cierre'", [incidenteId])).rows[0].n;
const contarEntradas = async (incidenteId) =>
  (await q('SELECT count(*)::int AS n FROM entradas_bitacora_incidente WHERE incidente_id = $1', [incidenteId])).rows[0].n;
const estadoDe = async (incidenteId) =>
  (await q('SELECT estado, version FROM incidentes WHERE id = $1', [incidenteId])).rows[0];

// Ejecuta un archivo SQL de una sola sesión y cuenta sus avisos "OK n:".
async function ejecutarSuiteSql(etiqueta, archivo, esperados, aplicacion) {
  console.log(`== Suite SQL ${etiqueta} (${archivo}) ==`);
  const sql = await readFile(path.join(migraciones, archivo), 'utf8');
  const casosSql = [];
  const cliente = new pg.Client({ ...config, application_name: aplicacion });
  exigirLocal(config);
  await cliente.connect();
  clientesAbiertos.push(cliente);
  cliente.on('notice', (aviso) => {
    if (/^OK \d+:/.test(aviso.message)) casosSql.push(aviso.message);
  });
  let errorSql = null;
  try {
    await cliente.query(sql);
  } catch (error) {
    errorSql = error;
  }
  for (const linea of casosSql) {
    total += 1;
    pasadas += 1;
    console.log(`OK   SQL ${etiqueta} ${linea.replace(/^OK /, '')}`);
  }
  if (errorSql) {
    total += 1;
    const mensaje = [errorSql.message, errorSql.where].filter(Boolean).join(' | ');
    fallos.push({ nombre: `SQL ${etiqueta} tras ${casosSql.length} casos`, mensaje });
    console.log(`FAIL SQL ${etiqueta} tras ${casosSql.length} casos\n     ${mensaje}`);
  } else if (casosSql.length !== esperados) {
    total += 1;
    fallos.push({ nombre: `SQL ${etiqueta}`, mensaje: `Se esperaban ${esperados} casos y se ejecutaron ${casosSql.length}` });
    console.log(`FAIL SQL ${etiqueta}: se esperaban ${esperados} casos y se ejecutaron ${casosSql.length}`);
  }
  await cliente.end();
}

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
      admin = new pg.Client({ ...config, application_name: 'hu42_admin' });
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
  for (const archivo of [...MIGRACIONES_PREVIAS, MIGRACION_HU42]) {
    await q(await readFile(path.join(migraciones, archivo), 'utf8'));
  }
  console.log(`init_schema.sql y ${MIGRACIONES_PREVIAS.length} migraciones previas aplicados (013 a 019, 022 a 024 incluidas), más la 025.\n`);

  // --- Suites SQL de una sola sesión --------------------------------------
  await ejecutarSuiteSql('HU-42', 'tests/hu42_cerrar_incidente.test.sql', CASOS_SQL_HU42, 'hu42_sql');
  console.log('');
  await ejecutarSuiteSql('HU-41 (regresión tras la 025)', 'tests/hu41_bitacora_incidente.test.sql', CASOS_SQL_HU41, 'hu42_sql_hu41');

  // --- Concurrencia con sesiones reales -----------------------------------
  console.log('\n== Concurrencia con sesiones reales ==');
  const rescatistaA = await crearRescatista('Rescatista A');
  const rescatistaB = await crearRescatista('Rescatista B');
  const conexionA = await abrir('hu42_a');
  const conexionB = await abrir('hu42_b');
  // El relevo (HU-40) se simula como superusuario con su propio application_name.
  const relevo = await abrirSuper('hu42_relevo');

  await caso('(a) el relevo toma la fila primero: el cierre de A espera y luego recibe NO_ES_RESPONSABLE con el nuevo responsable; 0 informes', async () => {
    const incidente = await crearIncidente(rescatistaA, 'localizado');
    await relevo.query('BEGIN');
    try {
      await relevo.query('SELECT id FROM incidentes WHERE id = $1 FOR UPDATE', [incidente]);
      await relevo.query('UPDATE incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidente, rescatistaB]);
      const pendiente = cerrar(conexionA, incidente, rescatistaA, 'evacuado', 'Cierre de A durante el relevo');
      await esperarBloqueo('hu42_a');
      await relevo.query('COMMIT');
      const a = await pendiente;
      assert.equal(a.ok, false, JSON.stringify(a));
      assert.equal(a.codigo, 'NO_ES_RESPONSABLE');
      assert.equal(a.detalle.id, rescatistaB);
      assert.equal(await contarInformes(incidente), 0);
      assert.equal((await estadoDe(incidente)).estado, 'localizado');
      const b = await cerrar(conexionB, incidente, rescatistaB, 'evacuado', 'Cierra el nuevo responsable');
      assert.equal(b.ok, true, JSON.stringify(b));
    } finally {
      await relevo.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(b) dos cierres con comandos distintos: A toma el bloqueo, B espera y recibe INCIDENTE_CERRADO; 1 informe y 1 entrada de cierre', async () => {
    const incidente = await crearIncidente(rescatistaA, 'localizado');
    await conexionA.query('BEGIN');
    try {
      const a = await cerrar(conexionA, incidente, rescatistaA, 'evacuado', 'Primer cierre');
      assert.equal(a.ok, true, JSON.stringify(a));
      const pendiente = cerrar(conexionB, incidente, rescatistaA, 'falsa_alarma', 'Segundo cierre');
      await esperarBloqueo('hu42_b');
      await conexionA.query('COMMIT');
      const b = await pendiente;
      assert.equal(b.ok, false, JSON.stringify(b));
      assert.equal(b.codigo, 'INCIDENTE_CERRADO');
      assert.equal(await contarInformes(incidente), 1);
      assert.equal(await contarCierres(incidente), 1);
      const { rows } = await q('SELECT resultado FROM informes_cierre_incidente WHERE incidente_id = $1', [incidente]);
      assert.equal(rows[0].resultado, 'evacuado');
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(b2) 10 rondas de dos cierres simultáneos (Promise.all): exactamente un éxito por ronda y un solo informe', async () => {
    for (let ronda = 0; ronda < 10; ronda += 1) {
      const incidente = await crearIncidente(rescatistaA, 'localizado');
      const [x, y] = await Promise.all([
        cerrar(conexionA, incidente, rescatistaA, 'evacuado', `Ronda ${ronda} A`),
        cerrar(conexionB, incidente, rescatistaA, 'asistido_en_terreno', `Ronda ${ronda} B`),
      ]);
      assert.equal([x, y].filter((r) => r.ok).length, 1, `ronda ${ronda}: ${JSON.stringify([x, y])}`);
      const perdedor = [x, y].find((r) => !r.ok);
      assert.equal(perdedor.codigo, 'INCIDENTE_CERRADO', `ronda ${ronda}: ${JSON.stringify(perdedor)}`);
      assert.equal(await contarInformes(incidente), 1);
      assert.equal(await contarCierres(incidente), 1);
    }
  });

  await caso('(c) el mismo comando a la vez desde 2 conexiones: ambas responden, una con repetido=false y otra con true, y hay un solo informe', async () => {
    const incidente = await crearIncidente(rescatistaA, 'localizado');
    const comando = randomUUID();
    const [a, b] = await Promise.all([
      cerrar(conexionA, incidente, rescatistaA, 'evacuado', 'Mismo comando', comando),
      cerrar(conexionB, incidente, rescatistaA, 'evacuado', 'Mismo comando', comando),
    ]);
    assert.equal(a.ok && b.ok, true, JSON.stringify([a, b]));
    assert.equal(a.r.id, b.r.id);
    assert.equal([a, b].filter((x) => x.r.repetido === false).length, 1);
    assert.equal([a, b].filter((x) => x.r.repetido === true).length, 1);
    assert.equal(await contarInformes(incidente), 1);
    assert.equal(await contarCierres(incidente), 1);
  });

  await caso('(d1) una nota de HU-41 toma la fila primero: el cierre espera y la nota queda antes de la entrada de cierre', async () => {
    const incidente = await crearIncidente(rescatistaA, 'localizado');
    await conexionA.query('BEGIN');
    try {
      const nota = await escribir(conexionA, incidente, rescatistaA, 'Nota previa al cierre'); // FOR SHARE tomado
      assert.equal(nota.ok, true, JSON.stringify(nota));
      const pendiente = cerrar(conexionB, incidente, rescatistaA, 'evacuado', 'Cierre tras la nota');
      await esperarBloqueo('hu42_b');
      await conexionA.query('COMMIT');
      const c = await pendiente;
      assert.equal(c.ok, true, JSON.stringify(c));
      const { rows } = await q(
        'SELECT tipo, texto FROM entradas_bitacora_incidente WHERE incidente_id = $1 ORDER BY registrada_en, secuencia', [incidente]);
      assert.deepEqual(rows.map((r) => r.tipo), ['nota', 'cierre']);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(d2) el cierre toma la fila primero: la nota de HU-41 espera y recibe INCIDENTE_CERRADO; el cierre queda como última entrada', async () => {
    const incidente = await crearIncidente(rescatistaA, 'localizado');
    await conexionA.query('BEGIN');
    try {
      const c = await cerrar(conexionA, incidente, rescatistaA, 'evacuado', 'Cierre primero'); // FOR UPDATE tomado
      assert.equal(c.ok, true, JSON.stringify(c));
      const pendiente = escribir(conexionB, incidente, rescatistaA, 'Nota tardía');
      await esperarBloqueo('hu42_b');
      await conexionA.query('COMMIT');
      const nota = await pendiente;
      assert.equal(nota.ok, false, JSON.stringify(nota));
      assert.equal(nota.codigo, 'INCIDENTE_CERRADO');
      assert.equal(await contarEntradas(incidente), 1);
      assert.equal(await contarCierres(incidente), 1);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(d3) 20 rondas de nota y cierre simultáneos: sin interbloqueos (40P01), el cierre siempre es la última entrada', async () => {
    for (let ronda = 0; ronda < 20; ronda += 1) {
      const incidente = await crearIncidente(rescatistaA, 'localizado');
      const [nota, cierre] = await Promise.all([
        escribir(conexionA, incidente, rescatistaA, `Nota de la ronda ${ronda}`),
        cerrar(conexionB, incidente, rescatistaA, 'evacuado', `Cierre de la ronda ${ronda}`),
      ]);
      assert.notEqual(nota.codigo, '40P01', `interbloqueo en la ronda ${ronda}`);
      assert.notEqual(cierre.codigo, '40P01', `interbloqueo en la ronda ${ronda}`);
      assert.equal(cierre.ok, true, `ronda ${ronda}: ${JSON.stringify(cierre)}`);
      if (!nota.ok) assert.equal(nota.codigo, 'INCIDENTE_CERRADO', `ronda ${ronda}: ${JSON.stringify(nota)}`);
      const { rows } = await q(
        'SELECT tipo FROM entradas_bitacora_incidente WHERE incidente_id = $1 ORDER BY registrada_en, secuencia', [incidente]);
      assert.equal(rows.at(-1).tipo, 'cierre', `ronda ${ronda}: ${JSON.stringify(rows)}`);
      assert.equal(rows.length, nota.ok ? 2 : 1);
    }
  });

  await caso('(e) un error forzado al insertar el informe revierte todo: 0 informes, 0 entradas de cierre, el incidente sigue localizado y la versión no cambia', async () => {
    const incidente = await crearIncidente(rescatistaA, 'localizado');
    const antes = await estadoDe(incidente);
    await q(`CREATE FUNCTION fallar_hu42() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HU42'; END$$;
             CREATE TRIGGER hu42_fallo BEFORE INSERT ON informes_cierre_incidente FOR EACH ROW EXECUTE FUNCTION fallar_hu42();`);
    try {
      const r = await cerrar(conexionA, incidente, rescatistaA, 'evacuado', 'No debe quedar');
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'FALLO_HU42');
    } finally {
      await q('DROP TRIGGER hu42_fallo ON informes_cierre_incidente; DROP FUNCTION fallar_hu42();');
    }
    assert.equal(await contarInformes(incidente), 0);
    assert.equal(await contarCierres(incidente), 0);
    const despues = await estadoDe(incidente);
    assert.equal(despues.estado, 'localizado');
    assert.equal(despues.version, antes.version);
  });

  await caso('(f) marcar localizado con el mismo operacionId a la vez: una escribe y la otra repite; una sola nota y una sola subida de versión', async () => {
    const incidente = await crearIncidente(rescatistaA);
    const antes = await estadoDe(incidente);
    const operacion = randomUUID();
    const [a, b] = await Promise.all([
      localizar(conexionA, incidente, rescatistaA, operacion),
      localizar(conexionB, incidente, rescatistaA, operacion),
    ]);
    assert.equal(a.ok && b.ok, true, JSON.stringify([a, b]));
    assert.equal([a, b].filter((x) => x.r.repetido === false).length, 1);
    assert.equal([a, b].filter((x) => x.r.repetido === true).length, 1);
    assert.equal(await contarEntradas(incidente), 1);
    const despues = await estadoDe(incidente);
    assert.equal(despues.estado, 'localizado');
    assert.equal(despues.version, antes.version + 1);
  });

  // --- Suite TypeScript contra este Postgres (puente supabase-js -> pg) ----
  console.log('\n== Suite TypeScript (hu42Postgres.integration.test.ts) ==');
  await caso('contrato del DAO y casos de uso reales sobre Postgres (node --test)', async () => {
    const credenciales = config.password ? `postgres:${encodeURIComponent(config.password)}` : 'postgres';
    const url = `postgres://${credenciales}@127.0.0.1:${config.port}/${config.database}`;
    exigirLocal({ host: '127.0.0.1', database: config.database });
    const backend = path.join(root, 'backend');
    try {
      const salida = await ejecutar(
        process.execPath,
        ['--import', 'tsx', '--test', 'src/testing/hu42Postgres.integration.test.ts'],
        { cwd: backend, env: { ...env, HU42_TEST_DATABASE_URL: url }, timeout: 5 * 60_000 },
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

console.log('\n================ Resumen HU-42 ================');
console.log(`PostgreSQL: ${versionPg}`);
console.log(`Casos: ${total} · pasaron: ${pasadas} · fallaron: ${fallos.length}`);
for (const f of fallos) console.log(` - ${f.nombre}: ${f.mensaje}`);
if (errorFatal) console.log(`ERROR de preparación: ${errorFatal.message}`);
process.exit(errorFatal || fallos.length > 0 || total === 0 ? 1 : 0);
