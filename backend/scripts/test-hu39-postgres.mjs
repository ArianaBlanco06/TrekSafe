// PostgreSQL desechable para HU-39 (017_hu39_asumir_coordinacion.sql).
//
// Uso (desde la raíz del repositorio):
//   node backend/scripts/test-hu39-postgres.mjs                    # Docker: postgres:18, puerto 55432
//   node backend/scripts/test-hu39-postgres.mjs --pg-bin <carpeta> # PostgreSQL instalado (initdb/pg_ctl)
//   Opcional: --port <n> (por defecto 55432)
//
// Seguridad: NO lee .env, DATABASE_URL ni SUPABASE_*, ignora las variables PG* del entorno
// y se niega a conectarse a cualquier host que no sea 127.0.0.1/localhost o a una base cuyo
// nombre no contenga "desechable". No puede tocar Supabase ni el DEV del equipo.
//
// Aplica init_schema.sql completo y las migraciones reales hasta la 016, más la 017. Después
// ejecuta backend/migrations/tests/hu39_asumir_coordinacion.test.sql y las pruebas de
// concurrencia con sesiones reales. Detiene y borra el servidor al terminar, aunque falle.
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

const NOMBRE_CONTENEDOR = 'treksafe-hu39-pg';
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
  const carpeta = await mkdtemp(path.join(tmpdir(), 'treksafe-hu39-'));
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

async function llamar(cliente, expedicionId, rescatistaId, operacionId) {
  try {
    const { rows } = await cliente.query('SELECT public.treksafe_asumir_coordinacion($1, $2, $3) AS r', [
      expedicionId, rescatistaId, operacionId,
    ]);
    return { ok: true, r: rows[0].r };
  } catch (error) {
    let detalle = null;
    try { detalle = error.detail ? JSON.parse(error.detail) : null; } catch { detalle = error.detail; }
    return { ok: false, codigo: error.message, detalle };
  }
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

const contarIncidentes = async (expedicionId) =>
  (await q('SELECT count(*)::int AS n FROM incidentes WHERE expedicion_id = $1', [expedicionId])).rows[0].n;

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
      admin = new pg.Client({ ...config, application_name: 'hu39_admin' });
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
  for (const archivo of [...MIGRACIONES_PREVIAS, '017_hu39_asumir_coordinacion.sql']) {
    await q(await readFile(path.join(migraciones, archivo), 'utf8'));
  }
  console.log(`init_schema.sql y ${MIGRACIONES_PREVIAS.length} migraciones previas aplicados, más la 017.
`);

  // --- Suite SQL de una sola sesión ---------------------------------------
  console.log('== Suite SQL (migrations/tests/hu39_asumir_coordinacion.test.sql) ==');
  const sql = await readFile(path.join(migraciones, 'tests/hu39_asumir_coordinacion.test.sql'), 'utf8');
  const casosSql = [];
  const clienteSql = new pg.Client({ ...config, application_name: 'hu39_sql' });
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
  } else if (casosSql.length !== 12) {
    total += 1;
    fallos.push({ nombre: 'SQL', mensaje: `Se esperaban 12 casos y se ejecutaron ${casosSql.length}` });
    console.log(`FAIL SQL: se esperaban 12 casos y se ejecutaron ${casosSql.length}`);
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
  const conexionA = await abrir('hu39_a');
  const conexionB = await abrir('hu39_b');

  await caso('barrera: A toma el bloqueo y duerme; B espera y recibe COORDINACION_YA_ASUMIDA con el responsable vigente', async () => {
    const expedicion = await crearAlerta();
    await conexionA.query('BEGIN');
    try {
      const a = await llamar(conexionA, expedicion, rescatistaA, randomUUID());
      assert.equal(a.ok, true);
      assert.equal(a.r.repetido, false);
      const pendiente = llamar(conexionB, expedicion, rescatistaB, randomUUID()); // B queda esperando el FOR UPDATE
      await esperarBloqueo('hu39_b');
      await conexionA.query('SELECT pg_sleep(0.3)'); // A conserva el bloqueo mientras B espera
      await conexionA.query('COMMIT');
      const b = await pendiente;
      assert.equal(b.ok, false);
      assert.equal(b.codigo, 'COORDINACION_YA_ASUMIDA');
      assert.equal(b.detalle.id, rescatistaA);
      assert.equal(b.detalle.nombreCompleto, 'Rescatista A');
      assert.equal(await contarIncidentes(expedicion), 1);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('25 rondas de dos asunciones simultáneas (Promise.all): gana una sola y la otra recibe el conflicto', async () => {
    let gananA = 0;
    for (let ronda = 1; ronda <= 25; ronda += 1) {
      const expedicion = await crearAlerta();
      const [a, b] = await Promise.all([
        llamar(conexionA, expedicion, rescatistaA, randomUUID()),
        llamar(conexionB, expedicion, rescatistaB, randomUUID()),
      ]);
      const ganadora = [a, b].filter((x) => x.ok);
      const perdedora = [a, b].filter((x) => !x.ok);
      assert.equal(ganadora.length, 1, `ronda ${ronda}: debía ganar exactamente una (${JSON.stringify([a, b])})`);
      assert.equal(perdedora.length, 1);
      assert.equal(ganadora[0].r.repetido, false);
      assert.equal(perdedora[0].codigo, 'COORDINACION_YA_ASUMIDA');
      assert.equal(perdedora[0].detalle.id, ganadora[0].r.responsable.id, `ronda ${ronda}: el conflicto debe nombrar al ganador`);
      assert.equal(await contarIncidentes(expedicion), 1);
      if (ganadora[0].r.responsable.id === rescatistaA) gananA += 1;
    }
    console.log(`     (A ganó ${gananA} rondas, B ganó ${25 - gananA})`);
  });

  await caso('el mismo comando enviado dos veces a la vez desde dos conexiones: ambas responden y queda un incidente', async () => {
    const expedicion = await crearAlerta();
    const operacion = randomUUID();
    const [a, b] = await Promise.all([
      llamar(conexionA, expedicion, rescatistaA, operacion),
      llamar(conexionB, expedicion, rescatistaA, operacion),
    ]);
    assert.equal(a.ok && b.ok, true, JSON.stringify([a, b]));
    assert.equal(a.r.id, b.r.id);
    assert.equal([a, b].filter((x) => x.r.repetido === false).length, 1);
    assert.equal(await contarIncidentes(expedicion), 1);
  });

  await caso('repetición posterior del mismo operacionId: mismo incidente y repetido=true', async () => {
    const expedicion = await crearAlerta();
    const operacion = randomUUID();
    const primera = await llamar(conexionA, expedicion, rescatistaA, operacion);
    const segunda = await llamar(conexionB, expedicion, rescatistaA, operacion);
    assert.equal(primera.ok && segunda.ok, true);
    assert.equal(segunda.r.id, primera.r.id);
    assert.equal(segunda.r.repetido, true);
    assert.equal(segunda.r.asumidoEn, primera.r.asumidoEn);
    assert.equal(await contarIncidentes(expedicion), 1);
  });

  await caso('operacionId de otro rescatista o de otra expedición: ALERTA_NO_ENCONTRADA (404), sin escribir', async () => {
    const expedicion = await crearAlerta();
    const otra = await crearAlerta();
    const operacion = randomUUID();
    assert.equal((await llamar(conexionA, expedicion, rescatistaA, operacion)).ok, true);
    const deOtroRescatista = await llamar(conexionB, expedicion, rescatistaB, operacion);
    assert.equal(deOtroRescatista.codigo, 'ALERTA_NO_ENCONTRADA');
    const deOtraExpedicion = await llamar(conexionA, otra, rescatistaA, operacion);
    assert.equal(deOtraExpedicion.codigo, 'ALERTA_NO_ENCONTRADA');
    assert.equal(await contarIncidentes(otra), 0);
  });

  await caso('operacionId ya usado en otro tipo de operación (eventos_plan): DATOS_INVALIDOS (400)', async () => {
    const expedicion = await crearAlerta();
    const operacion = randomUUID();
    await q(
      `INSERT INTO eventos_plan (expedicion_id, senderista_id, tipo, actor_id, version_resultante, cambios, operacion_id)
       VALUES ($1, $2, 'EDITADA', $2, 2, '{}'::jsonb, $3)`,
      [expedicion, senderista, operacion],
    );
    const r = await llamar(conexionA, expedicion, rescatistaA, operacion);
    assert.equal(r.codigo, 'DATOS_INVALIDOS');
    assert.equal(await contarIncidentes(expedicion), 0);
  });

  await caso('violación del índice único con otra vía que escribe sin bloquear la expedición: se relee y se informa el responsable vigente', async () => {
    const expedicion = await crearAlerta();
    const intruso = await abrir('hu39_intruso');
    await intruso.query('BEGIN');
    try {
      // Escribe un incidente sin tomar el bloqueo de la expedición (por ejemplo, una futura vía de relevo).
      await intruso.query('INSERT INTO incidentes (expedicion_id, responsable_id, operacion_id) VALUES ($1, $2, $3)', [
        expedicion, rescatistaB, randomUUID(),
      ]);
      const pendiente = llamar(conexionA, expedicion, rescatistaA, randomUUID()); // pasa el paso 4 y espera en el INSERT
      await esperarBloqueo('hu39_a');
      await intruso.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'COORDINACION_YA_ASUMIDA');
      assert.equal(r.detalle.id, rescatistaB);
      assert.equal(await contarIncidentes(expedicion), 1);
    } finally {
      await intruso.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('mismo operacionId en dos expediciones a la vez: la segunda recibe ALERTA_NO_ENCONTRADA y no se duplica nada', async () => {
    const primera = await crearAlerta();
    const segunda = await crearAlerta();
    const operacion = randomUUID();
    await conexionA.query('BEGIN');
    try {
      assert.equal((await llamar(conexionA, primera, rescatistaA, operacion)).ok, true);
      const pendiente = llamar(conexionB, segunda, rescatistaA, operacion); // espera el índice único de operacion_id
      await esperarBloqueo('hu39_b');
      await conexionA.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'ALERTA_NO_ENCONTRADA');
      assert.equal(await contarIncidentes(segunda), 0);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('la expedición sale de alerta mientras la asunción espera el bloqueo: ALERTA_NO_ENCONTRADA y ningún incidente', async () => {
    const expedicion = await crearAlerta();
    await conexionA.query('BEGIN');
    try {
      await conexionA.query("UPDATE expediciones SET estado = 'completada' WHERE id = $1", [expedicion]);
      const pendiente = llamar(conexionB, expedicion, rescatistaB, randomUUID());
      await esperarBloqueo('hu39_b');
      await conexionA.query('COMMIT');
      const r = await pendiente;
      assert.equal(r.codigo, 'ALERTA_NO_ENCONTRADA');
      assert.equal(await contarIncidentes(expedicion), 0);
    } finally {
      await conexionA.query('ROLLBACK').catch(() => {});
    }
  });

  await caso('error forzado al insertar revierte la asunción completa', async () => {
    const expedicion = await crearAlerta();
    await q(`CREATE FUNCTION fallar_hu39() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HU39'; END$$;
             CREATE TRIGGER hu39_fallo BEFORE INSERT ON incidentes FOR EACH ROW EXECUTE FUNCTION fallar_hu39();`);
    try {
      const r = await llamar(conexionA, expedicion, rescatistaA, randomUUID());
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'FALLO_HU39');
    } finally {
      await q('DROP TRIGGER hu39_fallo ON incidentes; DROP FUNCTION fallar_hu39();');
    }
    assert.equal(await contarIncidentes(expedicion), 0);
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

console.log('\n================ Resumen HU-39 ================');
console.log(`PostgreSQL: ${versionPg}`);
console.log(`Casos: ${total} · pasaron: ${pasadas} · fallaron: ${fallos.length}`);
for (const f of fallos) console.log(` - ${f.nombre}: ${f.mensaje}`);
if (errorFatal) console.log(`ERROR de preparación: ${errorFatal.message}`);
process.exit(errorFatal || fallos.length > 0 || total === 0 ? 1 : 0);
