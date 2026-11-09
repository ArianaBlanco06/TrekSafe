import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FachadaPlanExpedicion } from './FachadaPlanExpedicion.js';
import { PreparacionExpedicion } from '../../domain/entities/PreparacionExpedicion.js';
import { puntoFixture, rutaFixture, senderistaFixture as actor } from '../../testing/puntosRuta/fixtures.js';

function escenario() {
  const ruta = rutaFixture();
  ruta.puntos = [puntoFixture(2), puntoFixture(1)];
  const plan = { ...ruta.expedicion, senderistaId: actor, horaRetornoEstimada: '2099-01-01T18:00:00Z',
    minutosTolerancia: 30, idsContactos: ['contacto-privado'], nombresAcompanantes: ['Acompañante'] };
  const lectores = {
    plan: { obtenerPlan: async () => plan as typeof plan | null },
    puntos: { consultarPropia: async () => ruta },
    preparacion: { obtenerPreparacion: async () => null as PreparacionExpedicion | null },
  };
  return { ruta, plan, lectores, fachada: new FachadaPlanExpedicion(lectores.plan, lectores.puntos, lectores.preparacion) };
}

describe('HU-33 FachadaPlanExpedicion', () => {
  it('ordena los puntos sin mutar la fuente y funciona sin preparación', async () => {
    const { fachada, ruta } = escenario();
    const resultado = await fachada.obtener(actor, ruta.expedicion.id);
    assert.deepEqual(resultado.puntos.map(p => p.orden), [1, 2]);
    assert.deepEqual(ruta.puntos.map(p => p.orden), [2, 1]);
    assert.equal(resultado.preparacion, null);
    assert.ok(!('idsContactos' in resultado.plan));
    assert.ok(!('senderistaId' in resultado.plan));
  });
  it('rechaza un plan ajeno antes de consultar puntos o equipo', async () => {
    const { fachada, ruta, plan, lectores } = escenario();
    plan.senderistaId = 'otro';
    lectores.puntos.consultarPropia = async () => { assert.fail('No consultar puntos ajenos'); };
    await assert.rejects(fachada.obtener(actor, ruta.expedicion.id), { codigoEstado: 404 });
  });
  it('un plan inexistente devuelve el mismo 404', async () => {
    const { fachada, ruta, lectores } = escenario();
    lectores.plan.obtenerPlan = async () => null;
    await assert.rejects(fachada.obtener(actor, ruta.expedicion.id), { codigoEstado: 404 });
  });
  it('incluye la preparación obtenida por el puerto de HU-31', async () => {
    const { fachada, ruta, lectores } = escenario();
    const preparacion = new PreparacionExpedicion({ id: 'preparacion', expedicionId: ruta.expedicion.id,
      senderistaId: actor, listaOrigenId: null, nombreLista: 'Equipo', items: [
        { id: 'item', nombre: 'Agua', obligatorio: true, preparado: false },
      ], creadoEn: '2030-01-01T00:00:00Z', actualizadoEn: '2030-01-01T00:00:00Z' });
    lectores.preparacion.obtenerPreparacion = async () => preparacion;
    assert.equal((await fachada.obtener(actor, ruta.expedicion.id)).preparacion?.obligatoriosPendientes, 1);
  });
  it('un cambio de versión durante la consulta exige actualizar', async () => {
    const { fachada, ruta, plan } = escenario(); plan.version = 2;
    await assert.rejects(fachada.obtener(actor, ruta.expedicion.id), { codigoEstado: 409, codigo: 'RECORRIDO_ACTUALIZADO' });
  });
  it('propaga fallos técnicos en lugar de ocultarlos como preparación vacía', async () => {
    const { fachada, ruta, lectores } = escenario();
    lectores.preparacion.obtenerPreparacion = async () => { throw new Error('Fallo de lectura'); };
    await assert.rejects(fachada.obtener(actor, ruta.expedicion.id), /Fallo de lectura/);
  });
});
