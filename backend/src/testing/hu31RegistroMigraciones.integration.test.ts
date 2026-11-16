import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { crearPoolEquipoPruebas } from './contextoPostgresEquipoPruebas.js';

const conexion = process.env.HU31_TEST_DATABASE_URL;
const migraciones = [
  '008_hu31_preparacion_expedicion.sql',
  '009_hu31_operaciones_preparacion.sql',
];
const esperadas = [
  { version: '008', nombre: 'hu31_preparacion_expedicion', hu: 'HU-31' },
  { version: '009', nombre: 'hu31_operaciones_preparacion', hu: 'HU-31' },
];

describe('HU-31: registro condicional de migraciones en PostgreSQL local', { skip: !conexion }, () => {
  let administrador: pg.Pool;
  before(() => { administrador = crearPoolEquipoPruebas(conexion!); });
  after(async () => { await administrador?.end(); });

  for (const escenario of ['sin registro', 'registro vacío', 'versiones preexistentes']) {
    it(`ejecuta los archivos completos con ${escenario}`, async (t) => {
      // La conexión inicial ya exige loopback y la base desechable del ejecutor.
      // Cada variante usa su propia base nueva; nunca se eliminan tablas del resto de suites.
      const nombre = `treksafe_hu31_registro_${randomUUID().replaceAll('-', '')}`;
      assert.match(nombre, /^treksafe_hu31_registro_[a-f0-9]{32}$/);
      await administrador.query(`CREATE DATABASE "${nombre}"`);
      const url = new URL(conexion!);
      url.pathname = `/${nombre}`;
      const cliente = new pg.Client({ connectionString: url.toString() });
      t.after(async () => {
        try { await cliente.end(); }
        finally { await administrador.query(`DROP DATABASE "${nombre}"`); }
      });
      await cliente.connect();
      await cliente.query(await readFile(new URL('../../../init_schema.sql', import.meta.url), 'utf8'));
      for (const archivo of ['20261101_hu30_listas_equipo.sql', '20261101_hu30_operaciones_equipo.sql']) {
        await cliente.query(await readFile(new URL(`../../migrations/${archivo}`, import.meta.url), 'utf8'));
      }
      if (escenario !== 'sin registro') {
        // Misma estructura del registro transversal 000; fixture exclusiva de esta base.
        await cliente.query(`CREATE TABLE public.treksafe_migraciones (
          version VARCHAR(16) PRIMARY KEY, nombre VARCHAR(200) NOT NULL, hu VARCHAR(32),
          aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          aplicada_por VARCHAR(100) NOT NULL DEFAULT CURRENT_USER
        )`);
        if (escenario === 'versiones preexistentes') {
          for (const fila of esperadas) {
            await cliente.query(`INSERT INTO public.treksafe_migraciones(version,nombre,hu,aplicada_en,aplicada_por)
              VALUES($1,$2,$3,'2020-01-01T00:00:00Z','autor-anterior')`, [fila.version, fila.nombre, fila.hu]);
          }
        }
      }
      for (const archivo of migraciones) {
        await cliente.query(await readFile(new URL(`../../migrations/${archivo}`, import.meta.url), 'utf8'));
      }
      assert.equal((await cliente.query('SELECT count(*)::int AS n FROM public.preparaciones_expedicion')).rows[0].n, 0);
      if (escenario === 'sin registro') {
        assert.equal((await cliente.query("SELECT to_regclass('public.treksafe_migraciones') AS tabla")).rows[0].tabla, null);
      } else {
        assert.deepEqual((await cliente.query('SELECT version,nombre,hu FROM public.treksafe_migraciones ORDER BY version')).rows, esperadas);
        if (escenario === 'versiones preexistentes') {
          const registros = await cliente.query('SELECT aplicada_en,aplicada_por FROM public.treksafe_migraciones');
          assert.ok(registros.rows.every((fila) => fila.aplicada_en.toISOString() === '2020-01-01T00:00:00.000Z'
            && fila.aplicada_por === 'autor-anterior'));
        }
      }
    });
  }
});
