import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { DatosPlantilla, IPlantillaDAO } from '../../domain/repositories/IPlantillaDAO.js';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function datos(nombre: string, extra: Partial<DatosPlantilla> = {}): DatosPlantilla {
  return {
    nombre,
    lugarInicio: 'Cebollapampa',
    lugarFin: 'Laguna 69',
    coordenadasInicio: null,
    coordenadasFin: '-9.01050, -77.60420',
    minutosTolerancia: 30,
    idsContactos: [randomUUID()],
    nombresAcompanantes: ['Ana Torres'],
    ...extra,
  };
}

/** Suite de contrato reutilizable para toda implementación de IPlantillaDAO. */
export function verificarContratoPlantillaDAO(nombre: string, crearDAO: () => IPlantillaDAO): void {
  describe(`Contrato IPlantillaDAO: ${nombre}`, () => {
    it('crea y recupera una plantilla del propietario con versión 1', async () => {
      const dao = crearDAO();
      const A = randomUUID();
      const r = await dao.crear(A, datos('Laguna 69'));
      assert.equal(r.tipo, 'ok');
      if (r.tipo !== 'ok') return;
      assert.equal(r.plantilla.version, 1);
      assert.equal(r.plantilla.senderistaId, A);
      const buscada = await dao.buscarPorId(A, r.plantilla.id);
      assert.deepEqual(buscada, r.plantilla);
    });

    it('lista por actualizadoEn descendente de forma estable', async () => {
      const dao = crearDAO();
      const A = randomUUID();
      const a = await dao.crear(A, datos('Primera'));
      await esperar(15);
      const b = await dao.crear(A, datos('Segunda'));
      await esperar(15);
      if (a.tipo !== 'ok' || b.tipo !== 'ok') return assert.fail('creación fallida');
      assert.deepEqual((await dao.listarPorPropietario(A)).map((p) => p.nombre), ['Segunda', 'Primera']);
      const r = await dao.renombrar(A, a.plantilla.id, 'Primera renombrada', 1);
      assert.equal(r.tipo, 'ok');
      assert.deepEqual(
        (await dao.listarPorPropietario(A)).map((p) => p.nombre),
        ['Primera renombrada', 'Segunda'],
      );
      const otra = (await dao.listarPorPropietario(A)).map((p) => p.id);
      assert.deepEqual((await dao.listarPorPropietario(A)).map((p) => p.id), otra);
    });

    it('aísla por propietario: lo ajeno se comporta como inexistente', async () => {
      const dao = crearDAO();
      const A = randomUUID();
      const B = randomUUID();
      const r = await dao.crear(A, datos('Privada'));
      if (r.tipo !== 'ok') return assert.fail('creación fallida');
      const id = r.plantilla.id;
      assert.deepEqual(await dao.listarPorPropietario(B), []);
      assert.equal(await dao.buscarPorId(B, id), null);
      assert.deepEqual(await dao.renombrar(B, id, 'Robada', 1), { tipo: 'no_encontrada' });
      assert.equal(await dao.eliminar(B, id), false);
      const intacta = await dao.buscarPorId(A, id);
      assert.equal(intacta?.nombre, 'Privada');
      assert.equal(intacta?.version, 1);
    });

    it('renombrar usa compare-and-swap sobre la versión', async () => {
      const dao = crearDAO();
      const A = randomUUID();
      const r = await dao.crear(A, datos('Original'));
      if (r.tipo !== 'ok') return assert.fail('creación fallida');
      const ok = await dao.renombrar(A, r.plantilla.id, 'Nuevo', 1);
      assert.equal(ok.tipo, 'ok');
      if (ok.tipo === 'ok') assert.equal(ok.plantilla.version, 2);
      const obsoleta = await dao.renombrar(A, r.plantilla.id, 'Otro', 1);
      assert.deepEqual(obsoleta, { tipo: 'version_obsoleta', versionActual: 2 });
      assert.equal((await dao.buscarPorId(A, r.plantilla.id))?.nombre, 'Nuevo');
    });

    it('renombrar una plantilla inexistente devuelve no_encontrada', async () => {
      const dao = crearDAO();
      const resultado = await dao.renombrar(randomUUID(), randomUUID(), 'X', 1);
      assert.deepEqual(resultado, { tipo: 'no_encontrada' });
    });

    it('rechaza nombres duplicados sin distinguir mayúsculas ni espacios, solo dentro del mismo propietario', async () => {
      const dao = crearDAO();
      const A = randomUUID();
      const B = randomUUID();
      assert.equal((await dao.crear(A, datos('Laguna 69'))).tipo, 'ok');
      assert.deepEqual(await dao.crear(A, datos('  laguna 69 ')), { tipo: 'nombre_duplicado' });
      assert.equal((await dao.crear(B, datos('LAGUNA 69'))).tipo, 'ok');

      const otra = await dao.crear(A, datos('Otra'));
      if (otra.tipo !== 'ok') return assert.fail('creación fallida');
      assert.deepEqual(await dao.renombrar(A, otra.plantilla.id, 'LAGUNA 69', 1), {
        tipo: 'nombre_duplicado',
      });
      // Conservar el mismo nombre con otra capitalización no choca consigo misma.
      assert.equal((await dao.renombrar(A, otra.plantilla.id, 'OTRA', 1)).tipo, 'ok');
    });

    it('eliminar devuelve true una vez y false después', async () => {
      const dao = crearDAO();
      const A = randomUUID();
      const r = await dao.crear(A, datos('Temporal'));
      if (r.tipo !== 'ok') return assert.fail('creación fallida');
      assert.equal(await dao.eliminar(A, r.plantilla.id), true);
      assert.equal(await dao.eliminar(A, r.plantilla.id), false);
      assert.equal(await dao.buscarPorId(A, r.plantilla.id), null);
    });
  });
}
