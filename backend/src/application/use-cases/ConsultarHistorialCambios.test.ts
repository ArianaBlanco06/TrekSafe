import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ILectorEventosPlan, NuevoEventoPlan } from '../../domain/repositories/IEventosPlanDAO.js';
import type { IPropiedadExpedicion } from '../../domain/repositories/IPropiedadExpedicion.js';
import { EventosPlanDAOMemoria } from '../../infrastructure/repositories/memoria/EventosPlanDAOMemoria.js';
import { ConsultarHistorialCambios } from './ConsultarHistorialCambios.js';

const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const expedicionA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const expedicionB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const inexistente = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function preparar() {
  let ahora = new Date('2026-11-01T08:00:00.000Z');
  let id = 0;
  const dao = new EventosPlanDAOMemoria({ ahora: () => ahora }, () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`);
  const duenos = new Map([[expedicionA, actorA], [expedicionB, actorB]]);
  const propiedad: IPropiedadExpedicion = {
    async esPropietario(senderistaId, expedicionId) { return duenos.get(expedicionId) === senderistaId; },
  };
  const lecturas: { expedicionId: string; senderistaId: string }[] = [];
  const lector: ILectorEventosPlan = {
    async listarPorExpedicion(senderistaId, expedicionId) {
      lecturas.push({ expedicionId, senderistaId });
      return dao.listarPorExpedicion(senderistaId, expedicionId);
    },
  };
  let operacion = 0;
  async function registrar(iso: string, datos: Partial<NuevoEventoPlan>) {
    ahora = new Date(iso);
    return dao.registrar({
      expedicionId: expedicionA, senderistaId: actorA, tipo: 'EDITADA', actorId: actorA,
      versionResultante: 2, cambios: {}, motivo: null,
      operacionId: `99999999-9999-4999-8999-${String(++operacion).padStart(12, '0')}`,
      ...datos,
    });
  }
  return { caso: new ConsultarHistorialCambios(propiedad, lector), registrar, lecturas };
}

describe('HU-36: consultar historial de cambios del plan', () => {
  it('CA-01: responde 404 igual para ajena e inexistente sin consultar los eventos', async () => {
    const e = preparar();
    await e.registrar('2026-11-01T09:00:00.000Z', { expedicionId: expedicionB, senderistaId: actorB, actorId: actorB,
      cambios: { lugarFin: { antes: 'Privado B', despues: 'Otro B' } } });
    for (const id of [expedicionB, inexistente]) {
      await assert.rejects(e.caso.ejecutar(actorA, id), {
        codigoEstado: 404, codigo: 'EXPEDICION_NO_ENCONTRADA', message: 'Expedición no encontrada',
      });
    }
    assert.deepEqual(e.lecturas, []);
  });

  it('CA-02: muestra edición, cancelación y ampliación de retorno con sus cambios', async () => {
    const e = preparar();
    await e.registrar('2026-11-01T09:00:00.000Z', {
      cambios: {
        minutosTolerancia: { antes: 30, despues: 45 },
        lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' },
        idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] },
      },
    });
    await e.registrar('2026-11-01T10:00:00.000Z', {
      tipo: 'RETORNO_AMPLIADO', versionResultante: 3, motivo: 'Retraso por clima',
      cambios: { horaRetornoEstimada: { antes: '2026-11-15T18:00:00Z', despues: '2026-11-15T18:30:00Z' } },
    });
    await e.registrar('2026-11-01T11:00:00.000Z', {
      tipo: 'CANCELADA', versionResultante: 4, motivo: null,
      cambios: { estado: { antes: 'programada', despues: 'cancelada' } },
    });
    const historial = await e.caso.ejecutar(actorA, expedicionA);
    assert.equal(historial.expedicionId, expedicionA);
    assert.deepEqual(historial.cambios.map((c) => c.tipo), ['EDITADA', 'RETORNO_AMPLIADO', 'CANCELADA']);
    assert.deepEqual(historial.cambios[0], {
      id: '00000000-0000-4000-8000-000000000001', tipo: 'EDITADA', ocurridoEn: '2026-11-01T09:00:00.000Z',
      version: 2, autor: { esPropietario: true }, motivo: null, anonimizado: false,
      cambios: [
        { campo: 'lugarFin', antes: 'Laguna 69', despues: 'Nevado Ishinca' },
        { campo: 'minutosTolerancia', antes: 30, despues: 45 },
        { campo: 'idsContactos', antes: ['c1'], despues: ['c1', 'c2'] },
      ],
    });
    assert.equal(historial.cambios[1].motivo, 'Retraso por clima');
    assert.deepEqual(historial.cambios[2].cambios, [{ campo: 'estado', antes: 'programada', despues: 'cancelada' }]);
    assert.deepEqual(e.lecturas, [{ expedicionId: expedicionA, senderistaId: actorA }]);
  });

  it('devuelve una lista vacía si el plan no tiene cambios', async () => {
    const e = preparar();
    assert.deepEqual(await e.caso.ejecutar(actorA, expedicionA), { expedicionId: expedicionA, cambios: [] });
  });

  it('marca como anonimizado un evento sin cambios ni motivo y distingue otro autor', async () => {
    const e = preparar();
    await e.registrar('2026-11-01T09:00:00.000Z', { cambios: {}, motivo: null, actorId: actorB });
    const [entrada] = (await e.caso.ejecutar(actorA, expedicionA)).cambios;
    assert.equal(entrada.anonimizado, true);
    assert.deepEqual(entrada.cambios, []);
    assert.deepEqual(entrada.autor, { esPropietario: false });
  });

  it('CA-03: orden cronológico y respuesta sin datos sensibles ni identificadores internos', async () => {
    const e = preparar();
    await e.registrar('2026-11-01T12:00:00.000Z', { cambios: { lugarInicio: { antes: 'A', despues: 'B' } } });
    await e.registrar('2026-11-01T08:30:00.000Z', {
      cambios: {
        lugarFin: { antes: 'X', despues: 'Y' },
        ...({ hashContrasena: { antes: 'h1', despues: 'h2' }, fichaMedica: { antes: 'alergia', despues: 'x' } } as object),
      },
    });
    const historial = await e.caso.ejecutar(actorA, expedicionA);
    assert.deepEqual(historial.cambios.map((c) => c.ocurridoEn), ['2026-11-01T08:30:00.000Z', '2026-11-01T12:00:00.000Z']);
    const json = JSON.stringify(historial);
    assert.doesNotMatch(json, /contrasena|ficha|alerg|operacion|senderistaId|actorId/i);
    assert.deepEqual(Object.keys(historial.cambios[0]).sort(),
      ['anonimizado', 'autor', 'cambios', 'id', 'motivo', 'ocurridoEn', 'tipo', 'version']);
  });
});
