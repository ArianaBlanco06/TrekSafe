import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const URL_PRUEBA = process.env.TREKSAFE_PG_TEST_URL;
const directorio = path.dirname(fileURLToPath(import.meta.url));
const raizBackend = path.resolve(directorio, '../../..');
const leerSql = (...partes: string[]) => readFileSync(path.resolve(...partes), 'utf8');

/** Se niega a ejecutar SQL si la URL no apunta a una base local desechable. */
export function validarBaseDesechable(url: string): void {
  const analizada = new URL(url);
  const hostLocal = ['127.0.0.1', 'localhost'].includes(analizada.hostname);
  const nombreBd = decodeURIComponent(analizada.pathname.replace(/^\//, ''));
  if (!hostLocal) {
    throw new Error('TREKSAFE_PG_TEST_URL debe apuntar a 127.0.0.1 o localhost');
  }
  if (!nombreBd.includes('desechable')) {
    throw new Error('El nombre de la base de pruebas debe contener "desechable"');
  }
}

const motivoOmision = URL_PRUEBA
  ? false
  : 'TREKSAFE_PG_TEST_URL no está definida (se requiere una base PostgreSQL local desechable)';

describe('Migraciones SQL 000 y 001 (base local desechable)', { skip: motivoOmision }, () => {
  let cliente: pg.Client;
  const usuarioA = randomUUID();
  const usuarioB = randomUUID();

  const consultar = (sql: string, parametros: unknown[] = []) => cliente.query(sql, parametros);

  async function crearSenderista(id: string, sufijo: string) {
    await consultar(
      `INSERT INTO usuarios (id, correo_electronico, hash_contrasena, rol)
       VALUES ($1, $2, 'hash-ficticio', 'senderista')`,
      [id, `prueba-${sufijo}@ejemplo.test`],
    );
    await consultar(
      `INSERT INTO perfiles_senderista (usuario_id, nombre_completo, telefono, id_documento)
       VALUES ($1, $2, '+51999999999', $3)`,
      [id, `Persona ${sufijo}`, `DOC${sufijo}`],
    );
  }

  async function insertarPlantilla(senderistaId: string, nombre: string, extra: Record<string, unknown> = {}) {
    const valores = {
      lugar_inicio: 'Inicio',
      lugar_fin: 'Destino',
      minutos_tolerancia: 30,
      ids_contactos: [] as string[],
      nombres_acompanantes: [] as string[],
      version: 1,
      ...extra,
    };
    const r = await consultar(
      `INSERT INTO plantillas_ruta
         (senderista_id, nombre, lugar_inicio, lugar_fin, minutos_tolerancia, ids_contactos, nombres_acompanantes, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        senderistaId,
        nombre,
        valores.lugar_inicio,
        valores.lugar_fin,
        valores.minutos_tolerancia,
        valores.ids_contactos,
        valores.nombres_acompanantes,
        valores.version,
      ],
    );
    return r.rows[0] as Record<string, any>;
  }

  async function violaRestriccion(accion: () => Promise<unknown>, codigo: string) {
    await assert.rejects(accion, (err: any) => err?.code === codigo);
  }

  before(async () => {
    validarBaseDesechable(URL_PRUEBA!);
    cliente = new pg.Client({ connectionString: URL_PRUEBA });
    await cliente.connect();

    // init_schema.sql crea políticas para los roles de Supabase.
    await consultar(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;`);
    await consultar('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await consultar(leerSql(raizBackend, '..', 'init_schema.sql'));
    await consultar(leerSql(raizBackend, 'migrations', '000_registro_migraciones.sql'));
    await consultar(leerSql(raizBackend, 'migrations', '001_hu29_plantillas_ruta.sql'));

    await crearSenderista(usuarioA, 'A');
    await crearSenderista(usuarioB, 'B');
  });

  after(async () => {
    await cliente?.end();
  });

  it('registra 000 y 001 en treksafe_migraciones', async () => {
    const r = await consultar('SELECT version, hu FROM treksafe_migraciones ORDER BY version');
    assert.deepEqual(r.rows, [
      { version: '000', hu: 'transversal' },
      { version: '001', hu: 'HU-29' },
    ]);
  });

  it('000 es idempotente', async () => {
    await consultar(leerSql(raizBackend, 'migrations', '000_registro_migraciones.sql'));
    const r = await consultar('SELECT count(*)::int AS n FROM treksafe_migraciones');
    assert.equal(r.rows[0].n, 2);
  });

  it('aplicar 001 por segunda vez falla de forma explícita', async () => {
    await assert.rejects(
      () => consultar(leerSql(raizBackend, 'migrations', '001_hu29_plantillas_ruta.sql')),
      /ya está registrada/,
    );
    await consultar('ROLLBACK');
    const r = await consultar("SELECT count(*)::int AS n FROM treksafe_migraciones WHERE version = '001'");
    assert.equal(r.rows[0].n, 1);
  });

  it('el nombre es único por usuario sin distinguir mayúsculas ni espacios, pero no entre usuarios', async () => {
    await insertarPlantilla(usuarioA, 'Laguna 69');
    await violaRestriccion(() => insertarPlantilla(usuarioA, '  laguna 69 '), '23505');
    const deB = await insertarPlantilla(usuarioB, 'LAGUNA 69');
    assert.equal(deB.senderista_id, usuarioB);
  });

  it('el trigger incrementa la versión, fija actualizado_en y mantiene propietario y creado_en', async () => {
    const original = await insertarPlantilla(usuarioA, 'Trigger');
    await consultar('SELECT pg_sleep(0.05)');
    const r = await consultar(
      `UPDATE plantillas_ruta
          SET nombre = 'Trigger renombrada', senderista_id = $2, version = 99, creado_en = '2000-01-01', actualizado_en = '2000-01-01'
        WHERE id = $1 RETURNING *`,
      [original.id, usuarioB],
    );
    const actualizada = r.rows[0];
    assert.equal(actualizada.version, 2);
    assert.equal(actualizada.senderista_id, usuarioA);
    assert.equal(actualizada.creado_en.getTime(), original.creado_en.getTime());
    assert.ok(actualizada.actualizado_en.getTime() > original.actualizado_en.getTime());
  });

  it('compare-and-swap por versión: el segundo UPDATE con la versión vieja no afecta filas', async () => {
    const p = await insertarPlantilla(usuarioA, 'CAS');
    const primero = await consultar(
      "UPDATE plantillas_ruta SET nombre = 'CAS 2' WHERE id = $1 AND senderista_id = $2 AND version = 1",
      [p.id, usuarioA],
    );
    const segundo = await consultar(
      "UPDATE plantillas_ruta SET nombre = 'CAS 3' WHERE id = $1 AND senderista_id = $2 AND version = 1",
      [p.id, usuarioA],
    );
    assert.equal(primero.rowCount, 1);
    assert.equal(segundo.rowCount, 0);
  });

  it('aplica los CHECK de nombre, tolerancia, contactos, acompañantes y versión', async () => {
    const dieznuevos = Array.from({ length: 11 }, () => randomUUID());
    const veintiuno = Array.from({ length: 21 }, (_, i) => `Persona ${i}`);
    const casos: Array<[string, Record<string, unknown>, string]> = [
      ['   ', {}, '23514'],
      ['n'.repeat(81), {}, '22001'],
      ['Tolerancia 0', { minutos_tolerancia: 0 }, '23514'],
      ['Tolerancia 481', { minutos_tolerancia: 481 }, '23514'],
      ['Muchos contactos', { ids_contactos: dieznuevos }, '23514'],
      ['Muchos acompañantes', { nombres_acompanantes: veintiuno }, '23514'],
      ['Versión cero', { version: 0 }, '23514'],
    ];
    for (const [nombre, extra, codigo] of casos) {
      await violaRestriccion(() => insertarPlantilla(usuarioA, nombre, extra), codigo);
    }
    await insertarPlantilla(usuarioA, 'Límites', {
      minutos_tolerancia: 480,
      ids_contactos: dieznuevos.slice(0, 10),
      nombres_acompanantes: veintiuno.slice(0, 20),
    });
  });

  it('RLS habilitado con política deny para anon y authenticated', async () => {
    const r = await consultar(
      `SELECT c.relrowsecurity,
              (SELECT count(*)::int FROM pg_policies p
                WHERE p.tablename = c.relname AND p.policyname = 'treksafe_deny_anon_authenticated') AS politicas
         FROM pg_class c WHERE c.relname IN ('plantillas_ruta', 'treksafe_migraciones') ORDER BY c.relname`,
    );
    assert.equal(r.rows.length, 2);
    for (const fila of r.rows) {
      assert.equal(fila.relrowsecurity, true);
      assert.equal(fila.politicas, 1);
    }
  });

  it('no existe FK entre expediciones y plantillas_ruta, y borrar una plantilla no altera expediciones', async () => {
    const fk = await consultar(
      `SELECT count(*)::int AS n FROM pg_constraint
        WHERE contype = 'f'
          AND ((conrelid = 'expediciones'::regclass AND confrelid = 'plantillas_ruta'::regclass)
            OR (conrelid = 'plantillas_ruta'::regclass AND confrelid = 'expediciones'::regclass))`,
    );
    assert.equal(fk.rows[0].n, 0);

    const exp = await consultar(
      `INSERT INTO expediciones (senderista_id, lugar_inicio, lugar_fin, hora_inicio, hora_retorno_estimada, estado)
       VALUES ($1, 'Inicio', 'Destino', NOW() + interval '1 day', NOW() + interval '2 days', 'programada')
       RETURNING *`,
      [usuarioA],
    );
    const plantilla = await insertarPlantilla(usuarioA, 'Para borrar');
    const borrada = await consultar('DELETE FROM plantillas_ruta WHERE id = $1', [plantilla.id]);
    assert.equal(borrada.rowCount, 1);
    const despues = await consultar('SELECT * FROM expediciones WHERE id = $1', [exp.rows[0].id]);
    assert.deepEqual(despues.rows, exp.rows);
  });

  it('borrar la cuenta (cascada ARCO) elimina sus plantillas y no las de otros usuarios', async () => {
    const antesB = await consultar('SELECT count(*)::int AS n FROM plantillas_ruta WHERE senderista_id = $1', [usuarioB]);
    assert.ok(antesB.rows[0].n >= 1);
    await consultar('DELETE FROM usuarios WHERE id = $1', [usuarioA]);
    const deA = await consultar('SELECT count(*)::int AS n FROM plantillas_ruta WHERE senderista_id = $1', [usuarioA]);
    const deB = await consultar('SELECT count(*)::int AS n FROM plantillas_ruta WHERE senderista_id = $1', [usuarioB]);
    assert.equal(deA.rows[0].n, 0);
    assert.equal(deB.rows[0].n, antesB.rows[0].n);
  });

  it('la reversión .down.sql elimina la tabla y el registro 001', async () => {
    await consultar(leerSql(raizBackend, 'migrations', '001_hu29_plantillas_ruta.down.sql'));
    const tabla = await consultar("SELECT to_regclass('public.plantillas_ruta') AS t");
    assert.equal(tabla.rows[0].t, null);
    const reg = await consultar("SELECT count(*)::int AS n FROM treksafe_migraciones WHERE version = '001'");
    assert.equal(reg.rows[0].n, 0);
    await consultar(leerSql(raizBackend, 'migrations', '001_hu29_plantillas_ruta.sql'));
  });
});

describe('validarBaseDesechable', () => {
  it('acepta solo hosts locales con nombre que contenga "desechable"', () => {
    assert.doesNotThrow(() => validarBaseDesechable('postgres://postgres@127.0.0.1:55432/treksafe_desechable'));
    assert.doesNotThrow(() => validarBaseDesechable('postgres://postgres@localhost:5432/mi_desechable_1'));
    assert.throws(() => validarBaseDesechable('postgres://postgres@db.ejemplo.invalid:5432/treksafe_desechable'));
    assert.throws(() => validarBaseDesechable('postgres://postgres@127.0.0.1:5432/treksafe'));
    assert.throws(() => validarBaseDesechable('postgres://postgres@127.0.0.1:5432/postgres'));
  });
});
