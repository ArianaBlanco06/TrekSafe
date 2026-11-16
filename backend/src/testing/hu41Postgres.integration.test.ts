import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { AgregarEntradaBitacora } from '../application/use-cases/AgregarEntradaBitacora.js';
import { ComandoAgregarEntradaBitacora } from '../application/commands/ComandoAgregarEntradaBitacora.js';
import { ConsultarBitacoraIncidente } from '../application/use-cases/ConsultarBitacoraIncidente.js';
import { ErrorAplicacion } from '../shared/errors/ErrorAplicacion.js';
import { contextoPostgresBitacoraPruebas, crearPoolBitacoraPruebas } from './contextoPostgresBitacoraPruebas.js';
import { verificarContratoBitacoraIncidenteDAO } from './contratoBitacoraIncidenteDAO.js';

const conexion = process.env.HU41_TEST_DATABASE_URL;

describe('HU-41 PostgreSQL local desechable', { skip: !conexion }, () => {
  let pool: pg.Pool;
  before(() => {
    pool = crearPoolBitacoraPruebas(conexion!);
  });
  after(async () => {
    await pool?.end();
  });

  verificarContratoBitacoraIncidenteDAO('Contrato IBitacoraIncidenteDAO: SDK y PostgreSQL real mediante puente fetch',
    (t) => contextoPostgresBitacoraPruebas(pool, t));

  it('casos de uso reales: el responsable escribe, otro rescatista lee con puedeEscribir=false y recibe 403 con el vigente', async (t) => {
    const c = await contextoPostgresBitacoraPruebas(pool, t);
    const incidente = await c.crearIncidente();
    const agregar = new AgregarEntradaBitacora(c.dao);
    const consultar = new ConsultarBitacoraIncidente(c.dao);

    const { entrada, repetido } = await agregar.ejecutar(
      ComandoAgregarEntradaBitacora.crear(c.responsableA, incidente, { operacionId: randomUUID(), texto: 'Primera nota' }));
    assert.equal(repetido, false);
    assert.equal(entrada.tipo, 'nota');

    const comoA = await consultar.ejecutar(c.responsableA, incidente);
    assert.equal(comoA.puedeEscribir, true);
    assert.equal(comoA.entradas[0]?.autor.esMia, true);

    const comoB = await consultar.ejecutar(c.rescatistaB, incidente);
    assert.equal(comoB.puedeEscribir, false);
    assert.equal(comoB.esResponsable, false);
    assert.equal(comoB.entradas[0]?.autor.esMia, false);
    assert.equal(comoB.responsable.nombreResponsable, 'Ana Rescate');

    await assert.rejects(
      agregar.ejecutar(ComandoAgregarEntradaBitacora.crear(c.rescatistaB, incidente, { operacionId: randomUUID(), texto: 'No me toca' })),
      (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 403);
        assert.equal(e.codigo, 'NO_ES_RESPONSABLE');
        assert.deepEqual(e.extras, { responsableVigente: { responsableId: c.responsableA, nombreResponsable: 'Ana Rescate' } });
        return true;
      });
  });

  it('casos de uso reales: un incidente inexistente da 404 y uno cerrado da 409 pero se sigue leyendo', async (t) => {
    const c = await contextoPostgresBitacoraPruebas(pool, t);
    const consultar = new ConsultarBitacoraIncidente(c.dao);
    const agregar = new AgregarEntradaBitacora(c.dao);

    await assert.rejects(consultar.ejecutar(c.responsableA, randomUUID()), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.equal(e.codigoEstado, 404);
      return true;
    });

    const incidente = await c.crearIncidente();
    await agregar.ejecutar(ComandoAgregarEntradaBitacora.crear(c.responsableA, incidente, { operacionId: randomUUID(), texto: 'Antes del cierre' }));
    await c.cerrar(incidente);
    await assert.rejects(
      agregar.ejecutar(ComandoAgregarEntradaBitacora.crear(c.responsableA, incidente, { operacionId: randomUUID(), texto: 'Tarde' })),
      (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 409);
        assert.equal(e.codigo, 'INCIDENTE_CERRADO');
        return true;
      });
    const vista = await consultar.ejecutar(c.rescatistaB, incidente);
    assert.equal(vista.estado, 'cerrado');
    assert.equal(vista.puedeEscribir, false);
    assert.equal(vista.entradas.length, 1);
  });
});
