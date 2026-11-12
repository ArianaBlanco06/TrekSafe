import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import type { EstadoIncidente } from '../../domain/repositories/IIncidenteDAO.js';
import { BitacoraIncidenteDAOMemoria } from '../../infrastructure/repositories/memoria/BitacoraIncidenteDAOMemoria.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ConsultarBitacoraIncidente } from './ConsultarBitacoraIncidente.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXPEDICION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';

describe('ConsultarBitacoraIncidente', () => {
  let dao: BitacoraIncidenteDAOMemoria;
  let consulta: ConsultarBitacoraIncidente;

  const sembrar = (estado: EstadoIncidente) => dao.sembrarIncidente({ id: INCIDENTE, expedicionId: EXPEDICION, estado, responsableId: ANA });

  beforeEach(() => {
    dao = new BitacoraIncidenteDAOMemoria(new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]));
    consulta = new ConsultarBitacoraIncidente(dao);
  });

  it('un incidente inexistente da 404 INCIDENTE_NO_ENCONTRADO', async () => {
    await assert.rejects(consulta.ejecutar(ANA, INEXISTENTE), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.equal(e.codigoEstado, 404);
      assert.equal(e.codigo, 'INCIDENTE_NO_ENCONTRADO');
      return true;
    });
  });

  it('para el responsable, puedeEscribir es verdadero en abierto y localizado y falso en cerrado', async () => {
    sembrar('abierto');
    assert.deepEqual(
      [(await consulta.ejecutar(ANA, INCIDENTE)).esResponsable, (await consulta.ejecutar(ANA, INCIDENTE)).puedeEscribir],
      [true, true],
    );
    dao.cambiarEstado(INCIDENTE, 'localizado');
    assert.equal((await consulta.ejecutar(ANA, INCIDENTE)).puedeEscribir, true);
    dao.cambiarEstado(INCIDENTE, 'cerrado');
    const cerrada = await consulta.ejecutar(ANA, INCIDENTE);
    assert.equal(cerrada.puedeEscribir, false);
    assert.equal(cerrada.esResponsable, true);
    assert.equal(cerrada.estado, 'cerrado');
  });

  it('CA-03: otro rescatista ve la bitácora completa pero no puede escribir', async () => {
    sembrar('abierto');
    await dao.agregar({ incidenteId: INCIDENTE, autorId: ANA, texto: 'Primera', corrigeEntradaId: null, operacionId: crypto.randomUUID() });
    await dao.agregar({ incidenteId: INCIDENTE, autorId: ANA, texto: 'Segunda', corrigeEntradaId: null, operacionId: crypto.randomUUID() });
    const vista = await consulta.ejecutar(BETO, INCIDENTE);
    assert.equal(vista.esResponsable, false);
    assert.equal(vista.puedeEscribir, false);
    assert.deepEqual(vista.responsable, { responsableId: ANA, nombreResponsable: 'Ana Rescate' });
    assert.deepEqual(vista.entradas.map((e) => e.texto), ['Primera', 'Segunda']);
    assert.deepEqual(vista.entradas.map((e) => e.autor.esMia), [false, false]);
    assert.equal(vista.incidenteId, INCIDENTE);
    assert.equal(vista.expedicionId, EXPEDICION);
  });

  it('autor.esMia señala solo las entradas del consultante y tras el relevo la autoría se conserva', async () => {
    sembrar('abierto');
    await dao.agregar({ incidenteId: INCIDENTE, autorId: ANA, texto: 'De Ana', corrigeEntradaId: null, operacionId: crypto.randomUUID() });
    dao.relevar(INCIDENTE, BETO);
    await dao.agregar({ incidenteId: INCIDENTE, autorId: BETO, texto: 'De Beto', corrigeEntradaId: null, operacionId: crypto.randomUUID() });
    const comoBeto = await consulta.ejecutar(BETO, INCIDENTE);
    assert.deepEqual(comoBeto.entradas.map((e) => [e.autor.nombreAutor, e.autor.esMia]), [['Ana Rescate', false], ['Beto Rescate', true]]);
    assert.equal(comoBeto.puedeEscribir, true);
    assert.equal((await consulta.ejecutar(ANA, INCIDENTE)).puedeEscribir, false);
  });

  it('la vista no lleva datos médicos ni claves internas', async () => {
    sembrar('abierto');
    await dao.agregar({ incidenteId: INCIDENTE, autorId: ANA, texto: 'Nota', corrigeEntradaId: null, operacionId: crypto.randomUUID() });
    const vista = await consulta.ejecutar(ANA, INCIDENTE);
    assert.deepEqual(Object.keys(vista).sort(), ['entradas', 'esResponsable', 'estado', 'expedicionId', 'incidenteId', 'puedeEscribir', 'responsable']);
    assert.deepEqual(Object.keys(vista.entradas[0]!).sort(), ['autor', 'corrigeEntradaId', 'id', 'registradaEn', 'texto', 'tipo']);
  });

  it('un id que no es UUID da ZodError', async () => {
    await assert.rejects(consulta.ejecutar(ANA, 'no-es-uuid'), ZodError);
    await assert.rejects(consulta.ejecutar('no-es-uuid', INCIDENTE), ZodError);
  });
});
