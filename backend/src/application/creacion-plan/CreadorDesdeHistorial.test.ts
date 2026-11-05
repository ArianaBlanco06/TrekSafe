import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { IContactosVigentes } from '../../domain/repositories/IContactosVigentes.js';
import type { ExpedicionParaRepetir, IHistorialExpedicionesDAO } from '../../domain/repositories/IHistorialExpedicionesDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { CreadorDesdeHistorial } from './CreadorDesdeHistorial.js';
import { CreadorPlan } from './CreadorPlan.js';
import { verificarContratoCreadorPlan } from './contratoCreadorPlan.js';
import { PlanDesdeHistorial } from './PlanDesdeHistorial.js';

function escenario() {
  const senderistaId = randomUUID();
  const otroId = randomUUID();
  const vigentes = [randomUUID(), randomUUID()];
  const noVigentes = [randomUUID()];
  const contactosActuales = new Set<string>(vigentes);
  const consultas: { senderistaId: string; expedicionId: string }[] = [];
  const propia = {
    id: randomUUID(), senderistaId, estado: 'completada',
    lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69',
    coordenadasInicio: '-9.04700, -77.60900', coordenadasFin: '-9.01050, -77.60420',
    minutosTolerancia: 45,
    idsContactos: [vigentes[0], noVigentes[0], vigentes[1], vigentes[0]],
    nombresAcompanantes: ['Ana Torres', 'Luis Rojas'],
    // Un adaptador no debería entregar estos campos: aun así, no pasan al producto.
    horaInicio: '2025-01-10T08:00:00Z', horaRetornoEstimada: '2025-01-10T18:00:00Z',
    alertas: ['alerta-antigua'], confirmadoEn: '2025-01-10T17:00:00Z', fichaMedica: 'dato-ficticio',
  };
  const ajena: ExpedicionParaRepetir = { ...propia, id: randomUUID(), senderistaId: otroId };
  const filas = new Map<string, ExpedicionParaRepetir>([[propia.id, propia], [ajena.id, ajena]]);
  const historial: IHistorialExpedicionesDAO = {
    async buscarPorId(actor, id) {
      consultas.push({ senderistaId: actor, expedicionId: id });
      const fila = filas.get(id);
      return fila?.senderistaId === actor ? structuredClone(fila) : null;
    },
  };
  const contactos: IContactosVigentes = {
    async filtrarVigentes(actor, ids) {
      assert.equal(actor, senderistaId);
      return ids.filter((id) => contactosActuales.has(id));
    },
  };
  return {
    creador: new CreadorDesdeHistorial(contactos, historial),
    senderistaId, origenIdPropio: propia.id, origenIdAjeno: ajena.id,
    idsContactosVigentes: vigentes, idsContactosNoVigentes: noVigentes,
    propia, filas, historial, contactos, contactosActuales, consultas,
  };
}

// Exactamente la misma suite que utiliza CreadorDesdePlantilla en HU-29.
verificarContratoCreadorPlan('CreadorDesdeHistorial', escenario);

describe('CreadorDesdeHistorial', () => {
  it('es sustituible por CreadorPlan y conserva la ruta sin reutilizar la identidad de la expedición', async () => {
    const e = escenario();
    const creador: CreadorPlan = e.creador;
    assert.ok(creador instanceof CreadorPlan);
    const borrador = await creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.equal(borrador.origen, 'historial');
    assert.equal(borrador.origenId, e.origenIdPropio);
    assert.equal(borrador.descripcionOrigen, 'Expedición completada «Laguna 69»');
    assert.equal(borrador.lugarInicio, e.propia.lugarInicio);
    assert.equal(borrador.lugarFin, e.propia.lugarFin);
    assert.equal(borrador.coordenadasInicio, e.propia.coordenadasInicio);
    assert.equal(borrador.coordenadasFin, e.propia.coordenadasFin);
    assert.equal(borrador.minutosTolerancia, e.propia.minutosTolerancia);
    assert.deepEqual(borrador.nombresAcompanantes, e.propia.nombresAcompanantes);
    assert.deepEqual(e.consultas, [{ senderistaId: e.senderistaId, expedicionId: e.origenIdPropio }]);
    for (const campo of ['id', 'estado', 'senderistaId', 'alertas', 'confirmadoEn', 'fichaMedica']) {
      assert.equal(Object.hasOwn(borrador, campo), false);
    }
  });

  for (const estado of ['programada', 'en_progreso', 'alerta', 'cancelada']) {
    it(`rechaza una expedición ${estado} sin consultar contactos ni modificar el origen`, async () => {
      const e = escenario();
      const fila = { ...e.propia, estado };
      e.filas.set(fila.id, fila);
      const creador = new CreadorDesdeHistorial({
        async filtrarVigentes() { assert.fail('No debe consultar contactos para un origen no permitido.'); },
      }, e.historial);
      await assert.rejects(creador.prepararBorrador(e.senderistaId, fila.id), (error: unknown) =>
        error instanceof ErrorAplicacion && error.codigoEstado === 404
          && error.codigo === 'EXPEDICION_HISTORIAL_NO_ENCONTRADA');
      assert.deepEqual(e.filas.get(fila.id), fila);
    });
  }

  it('rechaza un origen ajeno incluso si un adaptador incumple el filtrado por propietario', async () => {
    const e = escenario();
    const creador = new CreadorDesdeHistorial(e.contactos, {
      async buscarPorId() { return { ...e.propia, senderistaId: randomUUID() }; },
    });
    await assert.rejects(creador.prepararBorrador(e.senderistaId, e.origenIdPropio), { codigoEstado: 404 });
  });

  it('revalida contactos al repetir, elimina duplicados y conserva el orden de los vigentes', async () => {
    const e = escenario();
    const primero = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.deepEqual(primero.idsContactos, e.idsContactosVigentes);
    assert.equal(primero.cantidadContactosNoVigentes, 1);
    e.contactosActuales.delete(e.idsContactosVigentes[0]);
    const segundo = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.deepEqual(segundo.idsContactos, [e.idsContactosVigentes[1]]);
    assert.equal(segundo.cantidadContactosNoVigentes, 2);
  });

  it('preparar un borrador no altera la expedición completada', async () => {
    const e = escenario();
    const original = structuredClone(e.propia);
    const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    borrador.idsContactos.length = 0;
    borrador.nombresAcompanantes.push('Cambio del borrador');
    borrador.lugarFin = 'Otro destino';
    assert.deepEqual(e.filas.get(e.origenIdPropio), original);
  });

  it('el producto no retiene referencias mutables ni datos privados del origen', () => {
    const e = escenario();
    const producto = new PlanDesdeHistorial(e.propia);
    e.propia.idsContactos.length = 0;
    e.propia.nombresAcompanantes[0] = 'Nombre cambiado';
    e.propia.lugarFin = 'Destino cambiado';
    assert.equal(producto.lugarFin, 'Laguna 69');
    assert.equal(producto.idsContactosSugeridos.length, 4);
    assert.equal(producto.nombresAcompanantes[0], 'Ana Torres');
    assert.equal(Object.isFrozen(producto), true);
    assert.equal(Object.hasOwn(producto, 'fichaMedica'), false);
    assert.equal(Object.hasOwn(producto, 'expedicion'), false);
  });

  it('admite un origen sin coordenadas ni contactos y propaga un fallo de consulta', async () => {
    const e = escenario();
    e.filas.set(e.origenIdPropio, { ...e.propia, coordenadasInicio: null, coordenadasFin: null,
      idsContactos: [], nombresAcompanantes: [] });
    const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
    assert.equal(borrador.coordenadasInicio, null);
    assert.equal(borrador.coordenadasFin, null);
    assert.deepEqual(borrador.idsContactos, []);
    assert.equal(borrador.cantidadContactosNoVigentes, 0);
    const fallo = new Error('Consulta no disponible.');
    const creador = new CreadorDesdeHistorial(e.contactos, {
      async buscarPorId() { throw fallo; },
    });
    await assert.rejects(creador.prepararBorrador(e.senderistaId, e.origenIdPropio), (error) => error === fallo);
  });
});
