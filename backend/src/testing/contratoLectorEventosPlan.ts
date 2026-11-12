import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, type TestContext } from 'node:test';
import type { ILectorEventosPlan, NuevoEventoPlan } from '../domain/repositories/IEventosPlanDAO.js';

export type ContextoContratoLectorEventosPlan = {
  lector: ILectorEventosPlan;
  senderistaA: string;
  senderistaB: string;
  expedicionA: string;
  expedicionB: string;
  /**
   * Persiste los eventos por grupos: los de un grupo comparten instante y cada grupo
   * ocurre estrictamente después del anterior.
   */
  sembrar(instantes: NuevoEventoPlan[][]): Promise<void>;
};

const INEXISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function eventoA(c: ContextoContratoLectorEventosPlan, datos: Partial<NuevoEventoPlan> = {}): NuevoEventoPlan {
  return {
    expedicionId: c.expedicionA, senderistaId: c.senderistaA, tipo: 'EDITADA', actorId: c.senderistaA,
    versionResultante: 2, cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } },
    motivo: null, operacionId: randomUUID(), ...datos,
  };
}

function eventoB(c: ContextoContratoLectorEventosPlan): NuevoEventoPlan {
  return eventoA(c, { expedicionId: c.expedicionB, senderistaId: c.senderistaB, actorId: c.senderistaB, motivo: 'motivo-privado-b' });
}

/** Misma evidencia para cualquier lector: memoria y PostgreSQL real (mediante puente). */
export function verificarContratoLectorEventosPlan(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoLectorEventosPlan | Promise<ContextoContratoLectorEventosPlan>,
): void {
  describe(nombre, () => {
    it('devuelve [] para expediciones ajenas, cruzadas o inexistentes', async (t) => {
      const c = await crearContexto(t);
      await c.sembrar([[eventoA(c), eventoB(c)]]);
      assert.deepEqual(await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionB), []);
      assert.deepEqual(await c.lector.listarPorExpedicion(c.senderistaB, c.expedicionA), []);
      assert.deepEqual(await c.lector.listarPorExpedicion(c.senderistaA, INEXISTENTE), []);
      assert.deepEqual(await c.lector.listarPorExpedicion(INEXISTENTE, c.expedicionA), []);
      assert.equal((await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA)).length, 1);
    });

    it('ordena por instante ascendente y, dentro de un instante, por id', async (t) => {
      const c = await crearContexto(t);
      const grupos = [[eventoA(c), eventoA(c), eventoA(c)], [eventoA(c)], [eventoA(c), eventoA(c)]];
      await c.sembrar(grupos);
      const lista = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
      assert.equal(lista.length, 6);
      const grupoDe = new Map(grupos.flatMap((grupo, indice) => grupo.map((e) => [e.operacionId, indice] as const)));
      assert.deepEqual(lista.map((e) => grupoDe.get(e.operacionId)), [0, 0, 0, 1, 2, 2]);
      for (let i = 0; i < lista.length; i++) {
        assert.equal(new Date(lista[i].ocurridoEn).toISOString(), lista[i].ocurridoEn);
        if (i === 0) continue;
        const [anterior, actual] = [lista[i - 1], lista[i]];
        if (grupoDe.get(anterior.operacionId) === grupoDe.get(actual.operacionId)) {
          assert.equal(actual.ocurridoEn, anterior.ocurridoEn);
          assert.ok(anterior.id.localeCompare(actual.id) < 0, 'desempate por id');
        } else {
          assert.ok(actual.ocurridoEn >= anterior.ocurridoEn, 'no decrece entre instantes');
        }
      }
    });

    it('dos lecturas devuelven lo mismo', async (t) => {
      const c = await crearContexto(t);
      await c.sembrar([[eventoA(c), eventoA(c)], [eventoA(c)]]);
      assert.deepEqual(
        await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA),
        await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA),
      );
    });

    it('no devuelve claves fuera de la lista blanca', async (t) => {
      const c = await crearContexto(t);
      const inyectado = { contrasena: { antes: 'x', despues: 'y' }, fichaMedica: { antes: 'alergia', despues: 'otra' } } as object;
      await c.sembrar([[eventoA(c, { cambios: { lugarFin: { antes: 'A', despues: 'B' }, ...inyectado } })]]);
      const [evento] = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
      assert.deepEqual(evento.cambios, { lugarFin: { antes: 'A', despues: 'B' } });
      assert.doesNotMatch(JSON.stringify(evento), /contrasena|fichaMedica|alergia/);
    });

    it('anonimizado solo con cambios vacíos y sin motivo', async (t) => {
      const c = await crearContexto(t);
      const anonimo = eventoA(c, { cambios: {}, motivo: null });
      const cancelada = eventoA(c, { tipo: 'CANCELADA', motivo: null,
        cambios: { estado: { antes: 'programada', despues: 'cancelada' } } });
      await c.sembrar([[anonimo], [cancelada]]);
      const lista = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
      const por = (id: string) => lista.find((e) => e.operacionId === id)!;
      assert.equal(por(anonimo.operacionId).anonimizado, true);
      assert.equal(por(cancelada.operacionId).anonimizado, false);
    });

    it('mutar el resultado no altera la siguiente lectura', async (t) => {
      const c = await crearContexto(t);
      await c.sembrar([[eventoA(c, { cambios: { idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] } } })]]);
      const [leido] = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
      (leido.cambios.idsContactos?.despues as string[]).push('c3');
      (leido as { motivo: string | null }).motivo = 'alterado';
      const [releido] = await c.lector.listarPorExpedicion(c.senderistaA, c.expedicionA);
      assert.deepEqual(releido.cambios.idsContactos?.despues, ['c1', 'c2']);
      assert.equal(releido.motivo, null);
    });
  });
}
