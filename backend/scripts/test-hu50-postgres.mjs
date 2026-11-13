// PostgreSQL desechable para HU-50 (029_hu50_ficha_medica_responsable.sql).
//
// Uso (desde la raíz del repositorio):
//   node backend/scripts/test-hu50-postgres.mjs                    # Docker: postgres:18, puerto 55432
//   node backend/scripts/test-hu50-postgres.mjs --pg-bin <carpeta> # PostgreSQL instalado (initdb/pg_ctl)
//   Opcional: --port <n> (por defecto 55432)
//
// Seguridad: NO lee .env, DATABASE_URL ni SUPABASE_*, ignora las variables PG* del entorno
// y se niega a conectarse a cualquier host que no sea 127.0.0.1/localhost o a una base cuyo
// nombre no contenga "desechable". No puede tocar Supabase ni el DEV del equipo.
//
// Aplica init_schema.sql completo y las migraciones reales hasta la 019 (más 015, 021 y 022
// a 024), después la 025 y la 029. Ejecuta backend/migrations/tests/hu50_ficha_medica_responsable.test.sql
// (14 casos), las suites SQL de HU-42 (13 casos) y HU-41 (16 casos) como regresión, pruebas de
// concurrencia con sesiones reales (relevo y cierre frente a la lectura de la ficha; 20
// registros de auditoría desde 2 sesiones) y la suite TypeScript hu50Postgres.integration.test.ts
// (HU50_TEST_DATABASE_URL apunta a este servidor). Cada incidente usa su propio senderista:
// DEP-04 (022) permite una sola expedición bloqueante por senderista. Detiene y borra el
// servidor al terminar, aunque falle.
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

const NOMBRE_CONTENEDOR = 'treksafe-hu50-pg';
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
  const carpeta = await mkdtemp(path.join(tmpdir(), 'treksafe-hu50-'));
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
  '021_hu40_transferir_coordinacion.sql',
  '022_dep108_crear_expedicion_atomica.sql', '023_dep108_avisos_transaccionales.sql',
  '024_dep108_vencimientos_outbox.sql',
];
const MIGRACIONES_POSTERIORES = ['025_hu42_cerrar_incidente.sql', '029_hu50_ficha_medica_responsable.sql'];
const CASOS_SQL_HU50 = 14;
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

// Lectura de la guarda de SQL (RPC real, como service_role). Devuelve { ok, r } o { ok:false, codigo, detalle }.
async function leerFicha(cliente, incidenteId, actorId) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_leer_ficha_cifrada_responsable($1, $2) AS r', [incidenteId, actorId]);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    return resultadoError(error);
  }
}

async function registrarAcceso(cliente, incidenteId, actorId, resultado, motivo) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_registrar_acceso_ficha_medica($1, $2, $3, $4) AS r', [
      incidenteId, actorId, resultado, motivo,
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
  const credencial = `CRED-H50-${id.slice(0, 8)}`;
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
  // Ficha ficticia: tipo de sangre y texto cifrado inventados (no es una carga real).
  await q(
    'INSERT INTO fichas_medicas (senderista_id, tipo_sangre, condiciones_encriptadas, consentimiento_firmado) VALUES ($1, $2, $3, TRUE)',
    [id, 'AB-', `CIFRADO-SECRETO-H50-${id.slice(0, 8)}`],
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

const contarAccesos = async (incidenteId) =>
  (await q('SELECT count(*)::int AS n FROM accesos_ficha_medica WHERE incidente_id = $1', [incidenteId])).rows[0].n;
const cifradaDe = async (incidenteId) =>
  (await q(
    `SELECT f.condiciones_encriptadas AS c FROM incidentes i JOIN expediciones e ON e.id = i.expedicion_id
     JOIN fichas_medicas f ON f.senderista_id = e.senderista_id WHERE i.id = $1`, [incidenteId])).rows[0].c;

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
      admin = new pg.Client({ ...config, application_name: 'hu50_admin' });
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
  for (const archivo of [...MIGRACIONES_PREVIAS, ...MIGRACIONES_POSTERIORES]) {
    await q(await readFile(path.join(migraciones, archivo), 'utf8'));
  }
  console.log(`init_schema.sql y ${MIGRACIONES_PREVIAS.length} migraciones previas aplicados (000 a 019, 021 y 022 a 024, con la 015), más la 025 y la 029.\n`);

  // --- Suites SQL de una sola sesión --------------------------------------
  await ejecutarSuiteSql('HU-50', 'tests/hu50_ficha_medica_responsable.test.sql', CASOS_SQL_HU50, 'hu50_sql');
  console.log('');
  await ejecutarSuiteSql('HU-42 (regresión tras la 029)', 'tests/hu42_cerrar_incidente.test.sql', CASOS_SQL_HU42, 'hu50_sql_hu42');
  console.log('');
  await ejecutarSuiteSql('HU-41 (regresión tras la 029)', 'tests/hu41_bitacora_incidente.test.sql', CASOS_SQL_HU41, 'hu50_sql_hu41');

  // --- Concurrencia con sesiones reales -----------------------------------
  console.log('\n== Concurrencia con sesiones reales ==');
  const rescatistaA = await crearRescatista('Rescatista A');
  const rescatistaB = await crearRescatista('Rescatista B');
  const conexionA = await abrir('hu50_a');
  const conexionB = await abrir('hu50_b');
  // El relevo (HU-40) se simula como superusuario con su propio application_name.
  const relevo = await abrirSuper('hu50_relevo');

  await caso('(a) el relevo toma la fila primero: la lectura de A espera y luego recibe NULL (0 datos); B recibe la ficha', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await relevo.query('BEGIN');
    try {
      await relevo.query('SELECT id FROM incidentes WHERE id = $1 FOR UPDATE', [incidente]);
      await relevo.query('UPDATE incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidente, rescatistaB]);
      const pendiente = leerFicha(conexionA, incidente, rescatistaA);
      await esperarBloqueo('hu50_a');
      await relevo.query('COMMIT');
      const a = await pendiente;
      assert.equal(a.ok, true, JSON.stringify(a));
      assert.equal(a.r, null, 'el responsable anterior no debe recibir datos tras el relevo');
      const b = await leerFicha(conexionB, incidente, rescatistaB);
      assert.equal(b.ok, true, JSON.stringify(b));
      assert.equal(b.r.cargaCifrada, await cifradaDe(incidente));
    } finally {
      await relevo.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(b) el cierre toma la fila primero: la lectura del responsable espera y luego recibe NULL; no queda ninguna fila de auditoría', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await relevo.query('BEGIN');
    try {
      await relevo.query('SELECT id FROM incidentes WHERE id = $1 FOR UPDATE', [incidente]);
      await relevo.query("UPDATE incidentes SET estado = 'cerrado', cerrado_en = now(), version = version + 1 WHERE id = $1", [incidente]);
      const pendiente = leerFicha(conexionA, incidente, rescatistaA);
      await esperarBloqueo('hu50_a');
      await relevo.query('COMMIT');
      const a = await pendiente;
      assert.equal(a.ok, true, JSON.stringify(a));
      assert.equal(a.r, null, 'un incidente cerrado no entrega la ficha');
      assert.equal(await contarAccesos(incidente), 0);
    } finally {
      await relevo.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(b2) la lectura toma FOR SHARE primero: el relevo espera a que termine la transacción de lectura y después B recibe la ficha', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await conexionA.query('BEGIN');
    try {
      const a = await leerFicha(conexionA, incidente, rescatistaA); // FOR SHARE tomado
      assert.equal(a.ok, true, JSON.stringify(a));
      assert.ok(a.r?.cargaCifrada, 'A debía recibir la ficha antes del relevo');
      const pendiente = relevo.query('UPDATE incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidente, rescatistaB]);
      await esperarBloqueo('hu50_relevo');
      await conexionA.query('COMMIT');
      await pendiente;
      const b = await leerFicha(conexionB, incidente, rescatistaB);
      assert.equal(b.r?.cargaCifrada, await cifradaDe(incidente));
      assert.equal((await leerFicha(conexionA, incidente, rescatistaA)).r, null);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('(b3) 20 rondas de relevo y lectura simultáneos: sin interbloqueos (40P01); tras el relevo A recibe NULL y B siempre recibe la ficha', async () => {
    for (let ronda = 0; ronda < 20; ronda += 1) {
      const incidente = await crearIncidente(rescatistaA);
      const [lectura] = await Promise.all([
        leerFicha(conexionA, incidente, rescatistaA),
        relevo.query('UPDATE incidentes SET responsable_id = $2, version = version + 1 WHERE id = $1', [incidente, rescatistaB]),
      ]);
      assert.equal(lectura.ok, true, `ronda ${ronda}: ${JSON.stringify(lectura)}`);
      assert.equal((await leerFicha(conexionA, incidente, rescatistaA)).r, null, `ronda ${ronda}: A no debe leer tras el relevo`);
      assert.ok((await leerFicha(conexionB, incidente, rescatistaB)).r?.cargaCifrada, `ronda ${ronda}`);
    }
  });

  await caso('(c) 20 registros de auditoría desde 2 sesiones a la vez: 20 filas con id distinto y ninguna con datos de salud', async () => {
    const incidente = await crearIncidente(rescatistaA);
    // Dos sesiones reales, cada una con 10 registros en serie; las dos corren a la vez.
    const rafaga = async (cliente, actor, resultado, motivo) => {
      const salida = [];
      for (let i = 0; i < 10; i += 1) salida.push(await registrarAcceso(cliente, incidente, actor, resultado, motivo));
      return salida;
    };
    const resultados = (await Promise.all([
      rafaga(conexionA, rescatistaB, 'denegado', 'NO_ES_RESPONSABLE'),
      rafaga(conexionB, rescatistaA, 'permitido', 'RESPONSABLE_VIGENTE'),
    ])).flat();
    assert.ok(resultados.every((r) => r.ok), JSON.stringify(resultados.filter((r) => !r.ok)));
    assert.equal(new Set(resultados.map((r) => r.r.id)).size, 20);
    assert.equal(await contarAccesos(incidente), 20);
    const { rows } = await q(
      "SELECT count(*)::int AS n FROM accesos_ficha_medica WHERE incidente_id = $1 AND to_jsonb(accesos_ficha_medica)::text LIKE '%CIFRADO-SECRETO%'",
      [incidente],
    );
    assert.equal(rows[0].n, 0);
  });

  await caso('(d) un error forzado al insertar la auditoría revierte la RPC: 0 filas', async () => {
    const incidente = await crearIncidente(rescatistaA);
    await q(`CREATE FUNCTION fallar_hu50() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HU50'; END$$;
             CREATE TRIGGER hu50_fallo BEFORE INSERT ON accesos_ficha_medica FOR EACH ROW EXECUTE FUNCTION fallar_hu50();`);
    try {
      const r = await registrarAcceso(conexionA, incidente, rescatistaA, 'permitido', 'RESPONSABLE_VIGENTE');
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'FALLO_HU50');
    } finally {
      await q('DROP TRIGGER hu50_fallo ON accesos_ficha_medica; DROP FUNCTION fallar_hu50();');
    }
    assert.equal(await contarAccesos(incidente), 0);
  });

  // --- Suite TypeScript contra este Postgres (puente supabase-js -> pg) ----
  console.log('\n== Suite TypeScript (hu50Postgres.integration.test.ts) ==');
  await caso('contrato del DAO, fachada y descifrado reales sobre Postgres (node --test)', async () => {
    const credenciales = config.password ? `postgres:${encodeURIComponent(config.password)}` : 'postgres';
    const url = `postgres://${credenciales}@127.0.0.1:${config.port}/${config.database}`;
    exigirLocal({ host: '127.0.0.1', database: config.database });
    const backend = path.join(root, 'backend');
    try {
      const salida = await ejecutar(
        process.execPath,
        ['--import', 'tsx', '--test', 'src/testing/hu50Postgres.integration.test.ts'],
        { cwd: backend, env: { ...env, HU50_TEST_DATABASE_URL: url }, timeout: 5 * 60_000 },
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

console.log('\n================ Resumen HU-50 ================');
console.log(`PostgreSQL: ${versionPg}`);
console.log(`Casos: ${total} · pasaron: ${pasadas} · fallaron: ${fallos.length}`);
for (const f of fallos) console.log(` - ${f.nombre}: ${f.mensaje}`);
if (errorFatal) console.log(`ERROR de preparación: ${errorFatal.message}`);
process.exit(errorFatal || fallos.length > 0 || total === 0 ? 1 : 0);
