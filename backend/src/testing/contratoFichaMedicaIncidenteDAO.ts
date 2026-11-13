import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, type TestContext } from 'node:test';
import type { FichaCifrada, IFichaMedicaIncidenteDAO } from '../domain/repositories/IFichaMedicaIncidenteDAO.js';
import { ErrorAplicacion } from '../shared/errors/ErrorAplicacion.js';

export type FixtureIncidenteFicha = {
  incidenteId: string;
  senderistaId: string;
  /** Ficha sembrada para el senderista dueño de la expedición del incidente. */
  ficha: FichaCifrada;
};

export type ContextoContratoFicha = {
  dao: IFichaMedicaIncidenteDAO;
  responsableA: string;
  rescatistaB: string;
  /** Incidente abierto, con la ficha con consentimiento del senderista sembrada. */
  crearIncidente(responsable?: string): Promise<FixtureIncidenteFicha>;
  /** Simula el relevo de HU-40. */
  relevar(incidenteId: string, nuevo: string): Promise<void>;
  marcarLocalizado(incidenteId: string): Promise<void>;
  /** Simula el cierre de HU-42. */
  cerrar(incidenteId: string): Promise<void>;
  /** Consentimiento revocado = la ficha deja de existir. */
  revocarConsentimiento(senderistaId: string): Promise<void>;
};

const nuevoId = (): string => randomUUID();

const rechazo500 = (e: unknown): boolean => {
  assert.ok(e instanceof ErrorAplicacion, `se esperaba ErrorAplicacion y llegó ${String(e)}`);
  assert.equal(e.codigoEstado, 500);
  return true;
};

/** Misma evidencia para cualquier implementación (LSP): memoria y PostgreSQL real (mediante puente). */
export function verificarContratoFichaMedicaIncidenteDAO(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoFicha | Promise<ContextoContratoFicha>,
): void {
  describe(nombre, () => {
    it('el contexto del responsable identifica incidente, estado y responsable y no lleva datos médicos', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      const contexto = await c.dao.leerContexto(f.incidenteId, c.responsableA);
      assert.equal(contexto.actorEsRescatista, true);
      assert.equal(contexto.consentimientoVigente, true);
      assert.equal(contexto.incidente?.id, f.incidenteId);
      assert.equal(contexto.incidente?.estado, 'abierto');
      assert.equal(contexto.incidente?.responsableId, c.responsableA);
      assert.equal(contexto.incidente?.senderistaId, f.senderistaId);
      const texto = JSON.stringify(contexto);
      assert.ok(!texto.includes(f.ficha.cargaCifrada), 'el contexto no puede llevar el texto cifrado');
      assert.ok(!texto.includes(f.ficha.tipoSangre), 'el contexto no puede llevar el tipo de sangre');
      assert.deepEqual(Object.keys(contexto.incidente ?? {}).sort(), ['estado', 'expedicionId', 'id', 'responsableId', 'senderistaId']);
    });

    it('un incidente inexistente da incidente null; un actor que no es rescatista da actorEsRescatista=false', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      const inexistente = await c.dao.leerContexto(nuevoId(), c.responsableA);
      assert.equal(inexistente.incidente, null);
      assert.equal(inexistente.actorEsRescatista, true);
      assert.equal(inexistente.consentimientoVigente, false);
      const noRescatista = await c.dao.leerContexto(f.incidenteId, nuevoId());
      assert.equal(noRescatista.actorEsRescatista, false);
    });

    it('el responsable vigente recibe el tipo de sangre y el texto cifrado', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      assert.deepEqual(await c.dao.leerSiResponsable(f.incidenteId, c.responsableA), f.ficha);
    });

    it('otro rescatista, un actor que no es rescatista y un incidente inexistente reciben null', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      assert.equal(await c.dao.leerSiResponsable(f.incidenteId, c.rescatistaB), null);
      assert.equal(await c.dao.leerSiResponsable(f.incidenteId, nuevoId()), null);
      assert.equal(await c.dao.leerSiResponsable(nuevoId(), c.responsableA), null);
    });

    it('el relevo mueve el acceso: el responsable anterior recibe null y el nuevo recibe la ficha', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      await c.relevar(f.incidenteId, c.rescatistaB);
      assert.equal(await c.dao.leerSiResponsable(f.incidenteId, c.responsableA), null);
      assert.deepEqual(await c.dao.leerSiResponsable(f.incidenteId, c.rescatistaB), f.ficha);
      assert.equal((await c.dao.leerContexto(f.incidenteId, c.responsableA)).incidente?.responsableId, c.rescatistaB);
    });

    it('un incidente localizado sigue entregando la ficha; al cerrarse devuelve null y el contexto informa cerrado', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      await c.marcarLocalizado(f.incidenteId);
      assert.deepEqual(await c.dao.leerSiResponsable(f.incidenteId, c.responsableA), f.ficha);
      assert.equal((await c.dao.leerContexto(f.incidenteId, c.responsableA)).incidente?.estado, 'localizado');
      await c.cerrar(f.incidenteId);
      assert.equal(await c.dao.leerSiResponsable(f.incidenteId, c.responsableA), null);
      assert.equal((await c.dao.leerContexto(f.incidenteId, c.responsableA)).incidente?.estado, 'cerrado');
    });

    it('con el consentimiento revocado devuelve null y el contexto informa consentimientoVigente=false', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      assert.equal((await c.dao.leerContexto(f.incidenteId, c.responsableA)).consentimientoVigente, true);
      await c.revocarConsentimiento(f.senderistaId);
      assert.equal(await c.dao.leerSiResponsable(f.incidenteId, c.responsableA), null);
      assert.equal((await c.dao.leerContexto(f.incidenteId, c.responsableA)).consentimientoVigente, false);
    });

    it('registra el acceso permitido y el denegado con id, ids del incidente y la hora del servidor, sin datos médicos', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      const antes = Date.now();
      const permitido = await c.dao.registrar({
        incidenteId: f.incidenteId, actorId: c.responsableA, resultado: 'permitido', motivo: 'RESPONSABLE_VIGENTE',
      });
      const denegado = await c.dao.registrar({
        incidenteId: f.incidenteId, actorId: c.rescatistaB, resultado: 'denegado', motivo: 'NO_ES_RESPONSABLE',
      });
      assert.ok(permitido.id.length > 0 && permitido.id !== denegado.id);
      assert.equal(permitido.incidenteId, f.incidenteId);
      assert.equal(permitido.senderistaId, f.senderistaId);
      assert.ok(permitido.expedicionId);
      assert.equal(permitido.actorId, c.responsableA);
      assert.equal(permitido.resultado, 'permitido');
      assert.equal(permitido.motivo, 'RESPONSABLE_VIGENTE');
      assert.equal(denegado.actorId, c.rescatistaB);
      assert.equal(denegado.resultado, 'denegado');
      assert.equal(denegado.motivo, 'NO_ES_RESPONSABLE');
      for (const r of [permitido, denegado]) {
        assert.equal(new Date(r.registradoEn).toISOString(), r.registradoEn, 'registradoEn debe ser ISO UTC');
        assert.ok(Math.abs(Date.parse(r.registradoEn) - antes) < 60_000, 'la hora debe ser la del servidor (ahora)');
        const texto = JSON.stringify(r);
        assert.ok(!texto.includes(f.ficha.cargaCifrada) && !texto.includes(f.ficha.tipoSangre));
      }
    });

    it('un acceso denegado sobre un incidente inexistente deja expedición y senderista en null', async (t) => {
      const c = await crearContexto(t);
      const registro = await c.dao.registrar({
        incidenteId: nuevoId(), actorId: c.rescatistaB, resultado: 'denegado', motivo: 'INCIDENTE_NO_ENCONTRADO',
      });
      assert.equal(registro.expedicionId, null);
      assert.equal(registro.senderistaId, null);
    });

    it('rechaza registros incoherentes: permitido con motivo de denegación, denegado con RESPONSABLE_VIGENTE y permitido sin incidente', async (t) => {
      const c = await crearContexto(t);
      const f = await c.crearIncidente();
      await assert.rejects(c.dao.registrar({
        incidenteId: f.incidenteId, actorId: c.responsableA, resultado: 'permitido', motivo: 'NO_ES_RESPONSABLE',
      }), rechazo500);
      await assert.rejects(c.dao.registrar({
        incidenteId: f.incidenteId, actorId: c.responsableA, resultado: 'denegado', motivo: 'RESPONSABLE_VIGENTE',
      }), rechazo500);
      await assert.rejects(c.dao.registrar({
        incidenteId: nuevoId(), actorId: c.responsableA, resultado: 'permitido', motivo: 'RESPONSABLE_VIGENTE',
      }), rechazo500);
    });
  });
}
