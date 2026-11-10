// PostgreSQL desechable para HU-40 (019_hu40_transferir_coordinacion.sql).
//
// Uso (desde la raíz del repositorio):
//   node backend/scripts/test-hu40-postgres.mjs                    // Docker: postgres:18, puerto 55432
//   node backend/scripts/test-hu40-postgres.mjs --pg-bin <carpeta> // PostgreSQL instalado (initdb/pg_ctl)
//   Opcional: --port <n> (por defecto 55432)
//
// Seguridad: NO lee .env, DATABASE_URL ni SUPABASE_*, ignora las variables PG* del entorno
// y se niega a conectarse a cualquier host que no sea 127.0.0.1/localhost o a una base cuyo
// nombre no contenga "desechable". No puede tocar Supabase ni el DEV del equipo.
//
// Aplica init_schema.sql completo y las migraciones reales hasta la 016, más la 017 y la 019.
// Ejecuta la suite SQL de HU-39 sin modificarla (regresión con la 019 aplicada), la suite SQL
// de HU-40 y las pruebas de concurrencia con sesiones reales. Detiene y borra el servidor al
// terminar, aunque falle.
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

const NOMBRE_CONTENEDOR = 'treksafe-hu40-pg';
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
  const carpeta = await mkdtemp(path.join(tmpdir(), 'treksafe-hu40-'));
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

async function rpc(cliente, funcion, args) {
  try {
    const marcas = args.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await cliente.query(`SELECT public.${funcion}(${marcas}) AS r`, args);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    let detalle = null;
    try { detalle = error.detail ? JSON.parse(error.detail) : null; } catch { detalle = error.detail; }
    return { ok: false, codigo: error.message, detalle };
  }
}
const proponer = (c, exp, actor, dest, motivo, version, op) =>
  rpc(c, 'treksafe_proponer_relevo', [exp, actor, dest, motivo, version, op]);
const aceptar = (c, exp, actor, relevo, op) => rpc(c, 'treksafe_aceptar_relevo', [exp, actor, relevo, op]);

const contar = async (sql, params) => (await q(sql, params)).rows[0].n;
const relevosDe = (incidente) => contar('SELECT count(*)::int AS n FROM relevos_coordinacion WHERE incidente_id = $1', [incidente]);
const pendientesDe = (incidente) =>
  contar("SELECT count(*)::int AS n FROM relevos_coordinacion WHERE incidente_id = $1 AND estado = 'pendiente'", [incidente]);
const transferenciasDe = (incidente) =>
  contar('SELECT count(*)::int AS n FROM transferencias_coordinacion WHERE incidente_id = $1', [incidente]);
const estadoDe = async (incidente) =>
  (await q('SELECT responsable_id, version, estado FROM incidentes WHERE id = $1', [incidente])).rows[0];

// Una alerta con su incidente abierto (la asunción de HU-39, insertada como superusuario).
async function crearIncidente(responsable) {
  const exp = await crearAlerta();
  const { rows } = await q(
    'INSERT INTO incidentes (expedicion_id, responsable_id, operacion_id) VALUES ($1, $2, $3) RETURNING id',
    [exp, responsable, randomUUID()],
  );
  return { exp, inc: rows[0].id };
}
async function crearPendiente(conexion, responsable, destinatario) {
  const { exp, inc } = await crearIncidente(responsable);
  const op = randomUUID();
  const p = await proponer(conexion, exp, responsable, destinatario, 'Cambio de turno', 1, op);
  assert.equal(p.ok, true, JSON.stringify(p));
  return { exp, inc, relevo: p.r.relevo.id, op };
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
const abrirSuperusuario = async (aplicacion) => {
  exigirLocal(config);
  const c = new pg.Client({ ...config, application_name: aplicacion });
  await c.connect();
  clientesAbiertos.push(c);
  return c;
};

async function ejecutarSuiteSql(archivo, esperados, etiqueta) {
  console.log(`== Suite SQL ${etiqueta} (migrations/tests/${archivo}) ==`);
  const sql = await readFile(path.join(migraciones, 'tests', archivo), 'utf8');
  const casosSql = [];
  const cliente = await abrirSuperusuario('hu40_sql');
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
    console.log(`OK   SQL ${linea.replace(/^OK /, '')}`);
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

async function principal() {
  config = binPg ? await iniciarBinarios() : await iniciarDocker();
  exigirLocal(config);

  // El contenedor puede aceptar la conexión TCP unos instantes después de pg_isready.
  for (let intento = 0; ; intento += 1) {
    try {
      admin = new pg.Client({ ...config, application_name: 'hu40_admin' });
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
  for (const archivo of [...MIGRACIONES_PREVIAS, '017_hu39_asumir_coordinacion.sql', '019_hu40_transferir_coordinacion.sql']) {
    await q(await readFile(path.join(migraciones, archivo), 'utf8'));
  }
  console.log(`init_schema.sql y ${MIGRACIONES_PREVIAS.length} migraciones previas aplicados, más la 017 y la 019.\n`);

  // --- Suites SQL de una sola sesión --------------------------------------
  await ejecutarSuiteSql('hu39_asumir_coordinacion.test.sql', 12, 'HU-39 (regresión, sin modificar, con la 019 aplicada)');
  console.log('');
  await ejecutarSuiteSql('hu40_transferir_coordinacion.test.sql', 16, 'HU-40');

  // --- Concurrencia con sesiones reales -----------------------------------
  console.log('\n== Concurrencia con sesiones reales ==');
  await q(`INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol) VALUES ($1, 'senderista.js@example.invalid', 'fixture', 'senderista')`, [
    (senderista = randomUUID()),
  ]);
  await q(`INSERT INTO perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento) VALUES ($1, 'Senderista JS', '999999999', '00000099')`, [senderista]);
  const rA = await crearRescatista('Rescatista A');
  const rB = await crearRescatista('Rescatista B');
  const rC = await crearRescatista('Rescatista C');
  const conexionA = await abrir('hu40_a');
  const conexionB = await abrir('hu40_b');

  await caso('dos propuestas (barrera): A propone a B y conserva el bloqueo; la propuesta a C espera y recibe RELEVO_PENDIENTE con el destinatario vigente', async () => {
    const { exp, inc } = await crearIncidente(rA);
    await conexionA.query('BEGIN');
    try {
      const a = await proponer(conexionA, exp, rA, rB, 'Turno', 1, randomUUID());
      assert.equal(a.ok, true, JSON.stringify(a));
      const pendiente = proponer(conexionB, exp, rA, rC, 'Otro', 1, randomUUID());
      await esperarBloqueo('hu40_b');
      await conexionA.query('SELECT pg_sleep(0.3)');
      await conexionA.query('COMMIT');
      const b = await pendiente;
      assert.equal(b.ok, false);
      assert.equal(b.codigo, 'RELEVO_PENDIENTE');
      assert.equal(b.detalle.destinatarioId, rB);
      assert.equal(b.detalle.relevoId, a.r.relevo.id);
      assert.equal('motivo' in b.detalle, false);
      assert.equal(await relevosDe(inc), 1);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('dos propuestas simultáneas (25 rondas, Promise.all): gana una y la otra recibe RELEVO_PENDIENTE con el ganador', async () => {
    for (let ronda = 1; ronda <= 25; ronda += 1) {
      const { exp, inc } = await crearIncidente(rA);
      const [x, y] = await Promise.all([
        proponer(conexionA, exp, rA, rB, 'Turno B', 1, randomUUID()),
        proponer(conexionB, exp, rA, rC, 'Turno C', 1, randomUUID()),
      ]);
      const ganadora = [x, y].filter((r) => r.ok);
      const perdedora = [x, y].filter((r) => !r.ok);
      assert.equal(ganadora.length, 1, `ronda ${ronda}: ${JSON.stringify([x, y])}`);
      assert.equal(perdedora[0].codigo, 'RELEVO_PENDIENTE');
      assert.equal(perdedora[0].detalle.destinatarioId, ganadora[0].r.relevo.destinatario.id, `ronda ${ronda}`);
      assert.equal(await pendientesDe(inc), 1);
      assert.equal(await relevosDe(inc), 1);
      assert.deepEqual({ ...(await estadoDe(inc)) }, { responsable_id: rA, version: 1, estado: 'abierto' });
    }
  });

  await caso('el mismo comando de proponer enviado a la vez desde dos conexiones: ambas responden y queda un solo relevo', async () => {
    const { exp, inc } = await crearIncidente(rA);
    const op = randomUUID();
    const [x, y] = await Promise.all([
      proponer(conexionA, exp, rA, rB, 'Turno', 1, op),
      proponer(conexionB, exp, rA, rB, 'Turno', 1, op),
    ]);
    assert.equal(x.ok && y.ok, true, JSON.stringify([x, y]));
    assert.equal(x.r.relevo.id, y.r.relevo.id);
    assert.equal([x, y].filter((r) => r.r.repetido === false).length, 1);
    assert.equal(await relevosDe(inc), 1);
  });

  await caso('proponer contra aceptar (barrera): B acepta y conserva el bloqueo; la propuesta de A espera y recibe NO_ES_RESPONSABLE', async () => {
    const { exp, inc, relevo } = await crearPendiente(conexionA, rA, rB);
    await conexionB.query('BEGIN');
    try {
      const b = await aceptar(conexionB, exp, rB, relevo, randomUUID());
      assert.equal(b.ok, true, JSON.stringify(b));
      const pendiente = proponer(conexionA, exp, rA, rC, 'Tarde', 1, randomUUID());
      await esperarBloqueo('hu40_a');
      await conexionB.query('SELECT pg_sleep(0.3)');
      await conexionB.query('COMMIT');
      const a = await pendiente;
      assert.equal(a.ok, false);
      assert.equal(a.codigo, 'NO_ES_RESPONSABLE');
      assert.equal(await relevosDe(inc), 1);
      assert.equal(await pendientesDe(inc), 0);
      assert.deepEqual({ ...(await estadoDe(inc)) }, { responsable_id: rB, version: 2, estado: 'abierto' });
    } finally {
      await conexionB.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('proponer contra aceptar (25 rondas, Promise.all): la aceptación gana siempre y nunca queda un segundo relevo', async () => {
    let propuestaPrimero = 0;
    for (let ronda = 1; ronda <= 25; ronda += 1) {
      const { exp, inc, relevo } = await crearPendiente(conexionA, rA, rB);
      const [prop, acep] = await Promise.all([
        proponer(conexionA, exp, rA, rC, 'Otra vez', 1, randomUUID()),
        aceptar(conexionB, exp, rB, relevo, randomUUID()),
      ]);
      assert.equal(acep.ok, true, `ronda ${ronda}: ${JSON.stringify([prop, acep])}`);
      assert.equal(prop.ok, false, `ronda ${ronda}: ${JSON.stringify(prop)}`);
      assert.ok(['NO_ES_RESPONSABLE', 'RELEVO_PENDIENTE'].includes(prop.codigo), `ronda ${ronda}: ${prop.codigo}`);
      if (prop.codigo === 'RELEVO_PENDIENTE') propuestaPrimero += 1;
      assert.equal(await relevosDe(inc), 1, `ronda ${ronda}`);
      assert.equal(await transferenciasDe(inc), 1, `ronda ${ronda}`);
      assert.deepEqual({ ...(await estadoDe(inc)) }, { responsable_id: rB, version: 2, estado: 'abierto' });
    }
    console.log(`     (la propuesta llegó antes que la aceptación en ${propuestaPrimero} rondas y después en ${25 - propuestaPrimero})`);
  });

  await caso('aceptar dos veces (barrera): la segunda espera y, con la misma operación, repite el resultado sin duplicar', async () => {
    const { exp, inc, relevo } = await crearPendiente(conexionA, rA, rB);
    const op = randomUUID();
    await conexionA.query('BEGIN');
    try {
      const a = await aceptar(conexionA, exp, rB, relevo, op);
      assert.equal(a.ok, true, JSON.stringify(a));
      const pendiente = aceptar(conexionB, exp, rB, relevo, op);
      await esperarBloqueo('hu40_b');
      await conexionA.query('SELECT pg_sleep(0.3)');
      await conexionA.query('COMMIT');
      const b = await pendiente;
      assert.equal(b.ok, true, JSON.stringify(b));
      assert.equal(b.r.repetido, true);
      assert.equal(b.r.version, 2);
      assert.equal(await transferenciasDe(inc), 1);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('aceptar dos veces a la vez (25 rondas): con la misma operación una escribe y la otra repite; con otra operación, RELEVO_YA_RESUELTO', async () => {
    for (let ronda = 1; ronda <= 25; ronda += 1) {
      const misma = await crearPendiente(conexionA, rA, rB);
      const op = randomUUID();
      const [x, y] = await Promise.all([
        aceptar(conexionA, misma.exp, rB, misma.relevo, op),
        aceptar(conexionB, misma.exp, rB, misma.relevo, op),
      ]);
      assert.equal(x.ok && y.ok, true, `ronda ${ronda}: ${JSON.stringify([x, y])}`);
      assert.equal([x, y].filter((r) => r.r.repetido === false).length, 1);
      assert.equal(await transferenciasDe(misma.inc), 1);
      assert.equal((await estadoDe(misma.inc)).version, 2);

      const distinta = await crearPendiente(conexionA, rA, rB);
      const [u, v] = await Promise.all([
        aceptar(conexionA, distinta.exp, rB, distinta.relevo, randomUUID()),
        aceptar(conexionB, distinta.exp, rB, distinta.relevo, randomUUID()),
      ]);
      const oks = [u, v].filter((r) => r.ok);
      const malos = [u, v].filter((r) => !r.ok);
      assert.equal(oks.length, 1, `ronda ${ronda}: ${JSON.stringify([u, v])}`);
      assert.equal(malos[0].codigo, 'RELEVO_YA_RESUELTO');
      assert.equal(await transferenciasDe(distinta.inc), 1);
      assert.equal((await estadoDe(distinta.inc)).version, 2);
    }
  });

  await caso('aceptar y proponer esperan un cierre en curso y reciben INCIDENTE_CERRADO', async () => {
    const cierre = await abrirSuperusuario('hu40_cierre');
    const aceptando = await crearPendiente(conexionA, rA, rB);
    await cierre.query('BEGIN');
    try {
      await cierre.query("UPDATE incidentes SET estado = 'cerrado', cerrado_en = now() WHERE id = $1", [aceptando.inc]);
      const pendiente = aceptar(conexionB, aceptando.exp, rB, aceptando.relevo, randomUUID());
      await esperarBloqueo('hu40_b');
      await cierre.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.codigo, 'INCIDENTE_CERRADO');
    } finally {
      await cierre.query('ROLLBACK').catch(() => {});
    }
    assert.equal(await transferenciasDe(aceptando.inc), 0);
    assert.equal((await estadoDe(aceptando.inc)).responsable_id, rA);

    const proponiendo = await crearIncidente(rA);
    await cierre.query('BEGIN');
    try {
      await cierre.query("UPDATE incidentes SET estado = 'cerrado', cerrado_en = now() WHERE id = $1", [proponiendo.inc]);
      const pendiente = proponer(conexionA, proponiendo.exp, rA, rB, 'Tarde', 1, randomUUID());
      await esperarBloqueo('hu40_a');
      await cierre.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.codigo, 'INCIDENTE_CERRADO');
    } finally {
      await cierre.query('ROLLBACK').catch(() => {});
    }
    assert.equal(await relevosDe(proponiendo.inc), 0);
  });

  await caso('el destinatario deja de ser rescatista validado mientras la aceptación espera el bloqueo: DESTINATARIO_NO_VALIDADO', async () => {
    const destinatario = await crearRescatista('Rescatista Baja');
    const { exp, inc, relevo } = await crearPendiente(conexionA, rA, destinatario);
    const baja = await abrirSuperusuario('hu40_baja');
    await baja.query('BEGIN');
    try {
      // Sin comprobar claves foráneas (solo en esta transacción del servidor desechable).
      await baja.query("SET LOCAL session_replication_role = 'replica'");
      await baja.query('SELECT 1 FROM incidentes WHERE id = $1 FOR UPDATE', [inc]);
      await baja.query('DELETE FROM perfiles_rescatista WHERE usuario_id = $1', [destinatario]);
      const pendiente = aceptar(conexionB, exp, destinatario, relevo, randomUUID()); // pasa el paso 4 y espera el bloqueo
      await esperarBloqueo('hu40_b');
      await baja.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.codigo, 'DESTINATARIO_NO_VALIDADO');
    } finally {
      await baja.query('ROLLBACK').catch(() => {});
    }
    assert.equal(await transferenciasDe(inc), 0);
    assert.equal((await estadoDe(inc)).responsable_id, rA);
  });

  await caso('otra vía inserta un pendiente sin bloquear el incidente: la propuesta espera el índice único y recibe RELEVO_PENDIENTE', async () => {
    const { exp, inc } = await crearIncidente(rA);
    const intruso = await abrir('hu40_intruso');
    await intruso.query('BEGIN');
    try {
      await intruso.query(
        `INSERT INTO relevos_coordinacion (incidente_id, responsable_anterior_id, destinatario_id, motivo, version_incidente, operacion_id)
         VALUES ($1, $2, $3, 'directo', 1, $4)`,
        [inc, rA, rC, randomUUID()],
      );
      const pendiente = proponer(conexionA, exp, rA, rB, 'Turno', 1, randomUUID()); // no ve el pendiente y espera en el INSERT
      await esperarBloqueo('hu40_a');
      await intruso.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'RELEVO_PENDIENTE');
      assert.equal(r.detalle.destinatarioId, rC);
      assert.equal(await relevosDe(inc), 1);
    } finally {
      await intruso.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('mismo operacionId de propuesta en dos incidentes a la vez: el segundo recibe INCIDENTE_NO_ENCONTRADO y no se duplica nada', async () => {
    const primero = await crearIncidente(rA);
    const segundo = await crearIncidente(rA);
    const op = randomUUID();
    await conexionA.query('BEGIN');
    try {
      assert.equal((await proponer(conexionA, primero.exp, rA, rB, 'Turno', 1, op)).ok, true);
      const pendiente = proponer(conexionB, segundo.exp, rA, rB, 'Turno', 1, op); // espera el índice único de operacion_id
      await esperarBloqueo('hu40_b');
      await conexionA.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'INCIDENTE_NO_ENCONTRADO');
      assert.equal(await relevosDe(segundo.inc), 0);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('error forzado al registrar la transferencia revierte la aceptación completa', async () => {
    const { exp, inc, relevo } = await crearPendiente(conexionA, rA, rB);
    await q(`CREATE FUNCTION fallar_hu40() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HU40'; END$$;
             CREATE TRIGGER hu40_fallo BEFORE INSERT ON transferencias_coordinacion FOR EACH ROW EXECUTE FUNCTION fallar_hu40();`);
    try {
      const r = await aceptar(conexionA, exp, rB, relevo, randomUUID());
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'FALLO_HU40');
    } finally {
      await q('DROP TRIGGER hu40_fallo ON transferencias_coordinacion; DROP FUNCTION fallar_hu40();');
    }
    assert.deepEqual({ ...(await estadoDe(inc)) }, { responsable_id: rA, version: 1, estado: 'abierto' });
    assert.equal(await pendientesDe(inc), 1);
    assert.equal(await transferenciasDe(inc), 0);
    const reintento = await aceptar(conexionA, exp, rB, relevo, randomUUID());
    assert.equal(reintento.ok, true, JSON.stringify(reintento));
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

console.log('\n================ Resumen HU-40 ================');
console.log(`PostgreSQL: ${versionPg}`);
console.log(`Casos: ${total} · pasaron: ${pasadas} · fallaron: ${fallos.length}`);
for (const f of fallos) console.log(` - ${f.nombre}: ${f.mensaje}`);
if (errorFatal) console.log(`ERROR de preparación: ${errorFatal.message}`);
process.exit(errorFatal || fallos.length > 0 || total === 0 ? 1 : 0);
