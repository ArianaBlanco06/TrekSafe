/**
 * Contrato de escritura de eventos del plan.
 * Solo implementaciones con escritura desde TS; en Supabase registran las RPC
 * (ver suite SQL de HU-36).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, type TestContext } from 'node:test';
import type { IEventosPlanDAO, NuevoEventoPlan } from '../domain/repositories/IEventosPlanDAO.js';

export type ContextoContratoRegistroEventosPlan = {
  dao: IEventosPlanDAO;
  senderistaA: string;
  expedicionA: string;
};

function nuevo(c: ContextoContratoRegistroEventosPlan, datos: Partial<NuevoEventoPlan> = {}): NuevoEventoPlan {
  return {
    expedicionId: c.expedicionA, senderistaId: c.senderistaA, tipo: 'EDITADA', actorId: c.senderistaA,
    versionResultante: 2, cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } },
    motivo: null, operacionId: randomUUID(), ...datos,
  };
}

const porId = <T extends { id: string }>(lista: T[]) => [...lista].sort((a, b) => a.id.localeCompare(b.id));

export function verificarContratoRegistroEventosPlan(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoRegistroEventosPlan | Promise<ContextoContratoRegistroEventosPlan>,
): void {
  describe(nombre, () => {
    it('anexa eventos y conserva los anteriores sin modificarlos', async (t) => {
      const c = await crearContexto(t);
      const primero = await c.dao.registrar(nuevo(c));
      const segundo = await c.dao.registrar(nuevo(c, {
        tipo: 'CANCELADA', versionResultante: 3, motivo: 'Mal clima',
        cambios: { estado: { antes: 'programada', despues: 'cancelada' } },
      }));
      assert.ok(primero.id);
      assert.notEqual(primero.id, segundo.id);
      assert.deepEqual(porId(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA)), porId([primero, segundo]));
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

    it('sanea cambios al registrar', async (t) => {
      const c = await crearContexto(t);
      const inyectado = { contrasena: { antes: 'x', despues: 'y' } } as object;
      const registrado = await c.dao.registrar(nuevo(c, {
        cambios: { idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] }, ...inyectado },
      }));
      assert.deepEqual(registrado.cambios, { idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] } });
      assert.deepEqual(await c.dao.listarPorExpedicion(c.senderistaA, c.expedicionA), [registrado]);
    });

    it('no expone operaciones de actualización ni eliminación', async (t) => {
      const c = await crearContexto(t);
      for (const metodo of ['actualizar', 'eliminar', 'borrar', 'modificar', 'upsert']) {
        assert.equal(metodo in c.dao, false, metodo);
      }
    });
  });
}
