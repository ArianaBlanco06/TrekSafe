import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type { BorradorPlan, CreadorPlan } from './CreadorPlan.js';

export type EscenarioCreadorPlan = {
  creador: CreadorPlan;
  senderistaId: string;
  /** Origen del senderista cuyo plan sugiere todos los contactos vigentes y no vigentes indicados. */
  origenIdPropio: string;
  /** Origen existente que pertenece a otro senderista. */
  origenIdAjeno: string;
  idsContactosVigentes: string[];
  idsContactosNoVigentes: string[];
};

const CLAVES_BORRADOR: Array<keyof BorradorPlan> = [
  'origen',
  'origenId',
  'descripcionOrigen',
  'lugarInicio',
  'lugarFin',
  'coordenadasInicio',
  'coordenadasFin',
  'minutosTolerancia',
  'idsContactos',
  'cantidadContactosNoVigentes',
  'nombresAcompanantes',
  'horaInicio',
  'horaRetornoEstimada',
  'requiereFechasNuevas',
];

/**
 * Suite de contrato (LSP) para cualquier subclase de CreadorPlan.
 * Se invoca desde el archivo .test.ts de cada variante.
 */
export function verificarContratoCreadorPlan(
  nombre: string,
  prepararEscenario: () => EscenarioCreadorPlan | Promise<EscenarioCreadorPlan>,
): void {
  describe(`Contrato CreadorPlan: ${nombre}`, () => {
    it('deja las fechas vacías y exige fechas nuevas', async () => {
      const e = await prepararEscenario();
      const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
      assert.equal(borrador.horaInicio, null);
      assert.equal(borrador.horaRetornoEstimada, null);
      assert.equal(borrador.requiereFechasNuevas, true);
      assert.equal(borrador.origenId, e.origenIdPropio);
    });

    it('conserva solo contactos vigentes y cuenta los no vigentes', async () => {
      const e = await prepararEscenario();
      const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
      assert.deepEqual([...borrador.idsContactos].sort(), [...e.idsContactosVigentes].sort());
      for (const id of e.idsContactosNoVigentes) {
        assert.ok(!borrador.idsContactos.includes(id));
      }
      assert.equal(borrador.cantidadContactosNoVigentes, e.idsContactosNoVigentes.length);
    });

    it('no copia campos propios de una expedición (id, estado, ficha médica, etc.)', async () => {
      const e = await prepararEscenario();
      const borrador = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
      assert.deepEqual(Object.keys(borrador).sort(), [...CLAVES_BORRADOR].sort());
    });

    it('devuelve copias: modificar un borrador no afecta al siguiente', async () => {
      const e = await prepararEscenario();
      const primero = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
      primero.idsContactos.length = 0;
      primero.nombresAcompanantes.push('Intruso');
      const segundo = await e.creador.prepararBorrador(e.senderistaId, e.origenIdPropio);
      assert.equal(segundo.idsContactos.length, e.idsContactosVigentes.length);
      assert.ok(!segundo.nombresAcompanantes.includes('Intruso'));
    });

    it('un origen ajeno o inexistente responde ErrorAplicacion 404', async () => {
      const e = await prepararEscenario();
      for (const origenId of [e.origenIdAjeno, randomUUID()]) {
        await assert.rejects(
          () => e.creador.prepararBorrador(e.senderistaId, origenId),
          (err: unknown) => err instanceof ErrorAplicacion && err.codigoEstado === 404,
        );
      }
    });
  });
}
