import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as esperar } from 'node:timers/promises';
import pg from 'pg';

// HU-27 CA-01 con DOS conexiones reales: una espera el bloqueo de la fila mientras la salida pasa.
// Se activa con TREKSAFE_PG_TEST_URL (mismo patrón que migraciones.test.ts): solo 127.0.0.1/localhost y una
// base cuyo nombre contenga "desechable". Crea y elimina su PROPIA base (<nombre>_hu27_cancelar), así que no
// choca con migraciones.test.ts, que reconstruye el esquema public de la base indicada y corre en paralelo.
const URL_PRUEBA = process.env.TREKSAFE_PG_TEST_URL;
const motivoOmision = URL_PRUEBA
  ? false
  : 'TREKSAFE_PG_TEST_URL no está definida (se requiere un PostgreSQL local desechable)';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const leerSql = (...partes: string[]) => readFileSync(path.resolve(raiz, ...partes), 'utf8');
const MIGRACIONES = [
  '000_registro_migraciones', '001_hu29_plantillas_ruta', '002_hu26_version_y_eventos_plan',
  '003_hu26_rpc_editar_expedicion', '004_hu27_estado_cancelada', '005_hu27_rpc_cancelar_expedicion',
  '006_hu27_permiso_anonimizar_eventos', '007_hu35_rpc_ampliar_retorno', '20261101_hu30_listas_equipo',
  '20261101_hu30_operaciones_equipo', '008_hu31_preparacion_expedicion', '009_hu31_operaciones_preparacion',
  '010_hu32_puntos_ruta', '011_hu29_endurecer_permisos', '012_hu36_eventos_plan_solo_anexado', '013_hu37_avisos',
  '014_hu38_minutos_recordatorio', '016_hu34_avances_expedicion', '018_hu27_cancelar_salida_futura',
];

/** Se niega a ejecutar SQL si la URL no apunta a una base local desechable (misma regla que migraciones.test.ts). */
function validarBaseDesechable(url: string): void {
  const u = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('TREKSAFE_PG_TEST_URL debe apuntar a 127.0.0.1 o localhost');
  if (!decodeURIComponent(u.pathname.replace(/^\//, '')).includes('desechable')) {
    throw new Error('El nombre de la base de pruebas debe contener "desechable"');
  }
}

const conUrl = (url: string, base: string) => {
  const u = new URL(url);
  u.pathname = `/${base}`;
  return u.toString();
};

describe('HU-27: cancelar espera un bloqueo y la salida pasa (dos conexiones reales)', { skip: motivoOmision }, () => {
  const baseNueva = `treksafe_hu27_cancelar_${process.pid}_desechable`;
  let urlNueva = '';
  let a: pg.Client; // retiene el bloqueo
  let b: pg.Client; // llama a la RPC como service_role

  before(async () => {
    validarBaseDesechable(URL_PRUEBA!);
    const admin = new pg.Client({ connectionString: URL_PRUEBA });
    await admin.connect();
    for (const rol of ['anon', 'authenticated']) {
      await admin.query(`CREATE ROLE ${rol} NOLOGIN`).catch((e: any) => { if (e.code !== '42710') throw e; });
    }
    await admin.query('CREATE ROLE service_role NOLOGIN BYPASSRLS').catch((e: any) => { if (e.code !== '42710') throw e; });
    await admin.query(`CREATE DATABASE ${baseNueva}`);
    await admin.end();

    urlNueva = conUrl(URL_PRUEBA!, baseNueva);
    validarBaseDesechable(urlNueva);
    a = new pg.Client({ connectionString: urlNueva });
    b = new pg.Client({ connectionString: urlNueva });
    await a.connect();
    await b.connect();
    // Emulación de Supabase: privilegios por defecto del esquema public.
    await a.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
    await a.query(leerSql('init_schema.sql'));
    for (const m of MIGRACIONES) await a.query(leerSql('backend', 'migrations', `${m}.sql`));
  });

  after(async () => {
    await a?.query('ROLLBACK').catch(() => {});
    await b?.query('ROLLBACK').catch(() => {});
    await a?.end().catch(() => {});
    await b?.end().catch(() => {});
    const admin = new pg.Client({ connectionString: URL_PRUEBA });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${baseNueva} WITH (FORCE)`);
    await admin.end();
  });

  it('la cancelación que esperaba el bloqueo se rechaza si la salida pasó mientras tanto', async () => {
    const senderista = randomUUID();
    const expedicion = randomUUID();
    const operacion = randomUUID();
    await a.query(`INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol)
                   VALUES ($1, $2, 'fixture', 'senderista')`, [senderista, `cancel-${senderista}@example.invalid`]);
    await a.query(`INSERT INTO perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
                   VALUES ($1, 'Persona Ficticia', '999999999', $2)`, [senderista, senderista.slice(0, 8)]);
    const salida = (await a.query(
      `INSERT INTO expediciones (id, senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
       VALUES ($1, $2, 'Inicio', 'Destino', clock_timestamp() + interval '2 seconds',
               clock_timestamp() + interval '1 day', 'programada') RETURNING hora_inicio`,
      [expedicion, senderista])).rows[0].hora_inicio as Date;

    // A retiene el bloqueo de la fila.
    await a.query('BEGIN');
    await a.query('SELECT id FROM expediciones WHERE id = $1 FOR UPDATE', [expedicion]);

    // B pide cancelar mientras la salida todavía es futura y queda esperando el bloqueo.
    await b.query('SET ROLE service_role');
    const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
    const resultadoB = b
      .query('SELECT public.treksafe_cancelar_expedicion($1, $2, $3, $4) AS r', [expedicion, senderista, 'Motivo', operacion])
      .then((r) => ({ ok: true as const, r: r.rows[0].r }), (e: any) => ({ ok: false as const, mensaje: String(e.message) }));

    let esperando = false;
    for (let i = 0; i < 100 && !esperando; i += 1) {
      await esperar(50);
      esperando = (await a.query(
        `SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'`, [pidB])).rowCount === 1;
    }
    assert.ok(esperando, 'B debía quedar esperando el bloqueo de la fila');
    const aunFutura = (await a.query('SELECT clock_timestamp() < $1::timestamptz AS futura', [salida])).rows[0].futura;
    assert.ok(aunFutura, 'la prueba no es válida: la salida ya pasó antes de que B quedara esperando');

    // A libera la fila solo cuando la salida ya pasó (reloj real de la base).
    while ((await a.query('SELECT clock_timestamp() <= $1::timestamptz + interval \'600 milliseconds\' AS antes', [salida]))
      .rows[0].antes) await esperar(50);
    await a.query('COMMIT');

    const r = await resultadoB;
    assert.deepEqual(r, { ok: false, mensaje: 'PLAN_NO_CANCELABLE' }, `B debía recibir PLAN_NO_CANCELABLE, recibió ${JSON.stringify(r)}`);
    const fila = (await a.query('SELECT estado, version FROM expediciones WHERE id = $1', [expedicion])).rows[0];
    assert.deepEqual(fila, { estado: 'programada', version: 1 });
    const eventos = (await a.query('SELECT count(*)::int AS n FROM eventos_plan WHERE expedicion_id = $1', [expedicion])).rows[0].n;
    assert.equal(eventos, 0, 'no debe haber evento nuevo en eventos_plan');
  });
});
