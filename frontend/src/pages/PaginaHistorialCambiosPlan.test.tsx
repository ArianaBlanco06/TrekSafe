import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { HistorialCambiosPlan } from './PaginaHistorialCambiosPlan';
import { ErrorClienteApi } from '../services/clienteApi';
import type { FuentesHistorialCambios, HistorialCambiosPlan as DatosHistorial } from '../services/historialCambios';
import { promesaPendiente } from '../testing/listasEquipoApiPruebas';

const expedicionA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const expedicionB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function historial(expedicionId = expedicionA): DatosHistorial {
  return {
    expedicionId,
    cambios: [
      {
        id: 'e1', tipo: 'EDITADA', ocurridoEn: '2026-11-01T09:00:00Z', version: 2, autor: { esPropietario: true },
        motivo: null, anonimizado: false,
        cambios: [
          { campo: 'lugarFin', antes: 'Laguna 69', despues: 'Nevado Ishinca' },
          { campo: 'idsContactos', antes: ['11111111-1111-4111-8111-111111111111'],
            despues: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] },
        ],
      },
      {
        id: 'e2', tipo: 'RETORNO_AMPLIADO', ocurridoEn: '2026-11-01T10:00:00Z', version: 3, autor: { esPropietario: true },
        motivo: 'Retraso por clima', anonimizado: false,
        cambios: [{ campo: 'horaRetornoEstimada', antes: '2026-11-15T18:00:00Z', despues: '2026-11-15T18:30:00Z' }],
      },
      {
        id: 'e3', tipo: 'CANCELADA', ocurridoEn: '2026-11-01T11:00:00Z', version: 4, autor: { esPropietario: false },
        motivo: null, anonimizado: false, cambios: [{ campo: 'estado', antes: 'programada', despues: 'cancelada' }],
      },
    ],
  };
}

async function preparar(t: TestContext, fuentes: FuentesHistorialCambios, enLinea = true) {
  const descriptores = new Map(['window', 'navigator', 'localStorage'].map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
  const eventos = new EventTarget();
  const navegador = { onLine: enLinea };
  const local = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: eventos });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navegador });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (clave: string) => local.get(clave) ?? null,
    setItem: (clave: string, valor: string) => local.set(clave, valor), removeItem: (clave: string) => local.delete(clave),
  } });
  let arbol!: ReactTestRenderer;
  const vista = (id = expedicionA, key = 'a') => <MemoryRouter><HistorialCambiosPlan key={key} expedicionId={id} fuentes={fuentes} /></MemoryRouter>;
  await act(async () => { arbol = create(vista()); });
  t.after(() => {
    act(() => arbol.unmount());
    for (const [nombre, descriptor] of descriptores) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else Reflect.deleteProperty(globalThis, nombre);
    }
  });
  const texto = () => JSON.stringify(arbol.toJSON());
  async function pulsar(etiqueta: string) {
    const boton = arbol.root.findAllByType('button')
      .find((b) => b.children.some((hijo) => typeof hijo === 'string' && hijo.trim() === etiqueta))!;
    await act(async () => { boton.props.onClick(); });
  }
  return { arbol, texto, pulsar, eventos, navegador, local,
    async remontar(id: string, key: string) { await act(async () => { arbol.update(vista(id, key)); }); },
  };
}

describe('Pantalla HU-36: historial de cambios del plan', () => {
  it('muestra los tres tipos de cambio en orden con valores legibles y contactos como cantidad', async (t) => {
    const pedidas: string[] = [];
    const v = await preparar(t, { async obtener(id) { pedidas.push(id); return historial(id); } });
    assert.deepEqual(pedidas, [expedicionA]);
    const titulos = v.arbol.root.findAllByType('h3').map((h) => h.children.join(''));
    assert.deepEqual(titulos, ['Edición', 'Ampliación de retorno', 'Cancelación']);
    const texto = v.texto();
    assert.match(texto, /Destino/);
    assert.match(texto, /Laguna 69/);
    assert.match(texto, /Nevado Ishinca/);
    assert.match(texto, /1 contacto/);
    assert.match(texto, /2 contactos/);
    assert.doesNotMatch(texto, /11111111-1111|22222222-2222/);
    assert.match(texto, /\+30 minutos/);
    assert.match(texto, /Retraso por clima/);
    assert.match(texto, /Cancelada/);
    assert.match(texto, /Otro usuario/);
    assert.match(texto, /"Tú"/);
  });

  it('distingue un plan sin cambios', async (t) => {
    const v = await preparar(t, { async obtener(id) { return { expedicionId: id, cambios: [] }; } });
    assert.match(v.texto(), /Este plan aún no tiene cambios registrados/);
    assert.equal(v.arbol.root.findAllByType('li').length, 0);
  });

  it('muestra un evento anonimizado sin detalle', async (t) => {
    const v = await preparar(t, { async obtener(id) {
      return { expedicionId: id, cambios: [{ id: 'e1', tipo: 'EDITADA', ocurridoEn: '2026-11-01T09:00:00Z', version: 2,
        autor: { esPropietario: true }, motivo: null, anonimizado: true, cambios: [] }] };
    } });
    assert.match(v.texto(), /Detalle eliminado por privacidad/);
    assert.equal(v.arbol.root.findAllByType('dl').length, 0);
  });

  it('muestra "Sin detalle disponible." si no hay datos y no está anonimizado', async (t) => {
    const v = await preparar(t, { async obtener(id) {
      return { expedicionId: id, cambios: [{ id: 'e1', tipo: 'CANCELADA', ocurridoEn: '2026-11-01T09:00:00Z', version: 2,
        autor: { esPropietario: true }, motivo: null, anonimizado: false, cambios: [] }] };
    } });
    assert.match(v.texto(), /Sin detalle disponible/);
    assert.doesNotMatch(v.texto(), /Detalle eliminado por privacidad/);
  });

  it('responde igual a una expedición ajena o inexistente', async (t) => {
    const v = await preparar(t, { async obtener() { throw new ErrorClienteApi('Expedición no encontrada', 404, 'EXPEDICION_NO_ENCONTRADA'); } });
    assert.match(v.texto(), /No encontramos esta expedición entre las tuyas/);
    assert.equal(v.arbol.root.findAllByType('li').length, 0);
  });

  it('un fallo permite reintentar', async (t) => {
    let fallar = true;
    const v = await preparar(t, { async obtener(id) {
      if (fallar) throw new ErrorClienteApi('No se pudo consultar el historial de cambios.', 500);
      return historial(id);
    } });
    assert.match(v.texto(), /No se pudo consultar el historial de cambios/);
    fallar = false;
    await v.pulsar('Actualizar historial');
    assert.equal(v.arbol.root.findAllByType('li').length, 3);
  });

  it('sin red no consulta y al reconectar carga; nunca guarda el historial localmente', async (t) => {
    let consultas = 0;
    const v = await preparar(t, { async obtener(id) { consultas++; return historial(id); } }, false);
    assert.equal(consultas, 0);
    assert.match(v.texto(), /Conéctate para consultar el historial de cambios/);
    await act(async () => { v.navegador.onLine = true; v.eventos.dispatchEvent(new Event('online')); });
    assert.equal(consultas, 1);
    assert.equal(v.arbol.root.findAllByType('li').length, 3);
    await act(async () => { v.navegador.onLine = false; v.eventos.dispatchEvent(new Event('offline')); });
    assert.equal(v.arbol.root.findAllByType('li').length, 0);
    assert.equal(v.local.size, 0);
  });

  it('descarta una respuesta tardía de otra expedición o cuenta', async (t) => {
    const pendiente = promesaPendiente<DatosHistorial>();
    const fuentes: FuentesHistorialCambios = { obtener: () => pendiente.promesa };
    const v = await preparar(t, fuentes);
    fuentes.obtener = async (id) => ({ expedicionId: id, cambios: [] });
    await v.remontar(expedicionB, 'b');
    await act(async () => { pendiente.resolver(historial(expedicionA)); });
    assert.doesNotMatch(v.texto(), /Laguna 69/);
    assert.match(v.texto(), /Este plan aún no tiene cambios registrados/);
  });
});
