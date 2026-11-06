import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type { IEventosPlanDAO, NuevoEventoPlan } from '../domain/repositories/IEventosPlanDAO.js';

export type ContextoContratoEventosPlan = {
  dao: IEventosPlanDAO;
  senderistaA: string;
  senderistaB: string;
  expedicionA: string;
  expedicionB: string;
  /** Fija el reloj de la persistencia para los siguientes registros. */
  fijarReloj(iso: string): void;
};

let secuencia = 0;
function operacion(): string {
  secuencia += 1;
  return `00000000-0000-4000-8000-${String(secuencia).padStart(12, '0')}`;
}

function nuevo(c: ContextoContratoEventosPlan, datos: Partial<NuevoEventoPlan> = {}): NuevoEventoPlan {
  return {
    expedicionId: c.expedicionA,
    senderistaId: c.senderistaA,
    tipo: 'EDITADA',
    actorId: c.senderistaA,
    versionResultante: 2,
    cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } },
    motivo: null,
    operacionId: operacion(),
    ...datos,
  };
}

/** Misma evidencia de comportamiento para cualquier implementación de IEventosPlanDAO. */
export function verificarContratoEventosPlanDAO(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoEventosPlan | Promise<ContextoContratoEventosPlan>,
): void {
  describe(nombre, () => {
    it('anexa eventos y conserva los anteriores sin modificarlos', async (t) => {
      const c = await crearContexto(t);
      c.fijarReloj('2026-11-01T10:00:00.000Z');
      const primero = await c.dao.registrar(nuevo(c));
      c.fijarReloj('2026-11-01T11:00:00.000Z');
      const segundo = await c.dao.registrar(nuevo(c, {
        tipo: 'CANCELADA', versionResultante: 3, motivo: 'Mal clima',
        cambios: { estado: { antes: 'programada', despues: 'cancelada' } },
      }));
      assert.ok(primero.id);
      assert.notEqual(primero.id, segundo.id);
      assert.equal(primero.ocurridoEn, '2026-11-01T10:00:00.000Z');
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA), [primero, segundo]);
    });

    it('rechaza un operacionId repetido sin sobrescribir el evento original', async (t) => {
      const c = await crearContexto(t);
      const original = await c.dao.registrar(nuevo(c));
      await assert.rejects(
        c.dao.registrar(nuevo(c, { operacionId: original.operacionId, tipo: 'CANCELADA', motivo: 'otro' })),
        { codigoEstado: 409, codigo: 'OPERACION_YA_REGISTRADA' },
      );
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA), [original]);
    });

    it('ordena por fecha ascendente y desempata por id de forma estable', async (t) => {
      const c = await crearContexto(t);
      c.fijarReloj('2026-11-01T12:00:00.000Z');
      const tardio = await c.dao.registrar(nuevo(c));
      c.fijarReloj('2026-11-01T09:00:00.000Z');
      const empateA = await c.dao.registrar(nuevo(c));
      const empateB = await c.dao.registrar(nuevo(c));
      const empatados = [empateA, empateB].sort((a, b) => a.id.localeCompare(b.id));
      const lista = await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA);
      assert.deepEqual(lista.map((evento) => evento.id), [...empatados.map((evento) => evento.id), tardio.id]);
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA), lista);
    });

    it('solo devuelve eventos de la expedición y del propietario indicados', async (t) => {
      const c = await crearContexto(t);
      const propio = await c.dao.registrar(nuevo(c));
      await c.dao.registrar(nuevo(c, { expedicionId: c.expedicionB, senderistaId: c.senderistaB, actorId: c.senderistaB }));
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA), [propio]);
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaB, c.expedicionA), []);
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionB), []);
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), []);
    });

    it('sanea cambios al registrar y devuelve copias que no alteran lo guardado', async (t) => {
      const c = await crearContexto(t);
      const inyectado = { contrasena: { antes: 'x', despues: 'y' } } as object;
      const registrado = await c.dao.registrar(nuevo(c, {
        cambios: { idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] }, ...inyectado },
      }));
      assert.deepEqual(registrado.cambios, { idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] } });
      const [leido] = await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA);
      (leido.cambios.idsContactos?.despues as string[]).push('c3');
      const [releido] = await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA);
      assert.deepEqual(releido.cambios.idsContactos?.despues, ['c1', 'c2']);
    });

    it('no expone operaciones de actualización ni eliminación', async (t) => {
      const c = await crearContexto(t);
      for (const metodo of ['actualizar', 'eliminar', 'borrar', 'modificar', 'upsert']) {
        assert.equal(metodo in c.dao, false, metodo);
      }
    });
  });
}
