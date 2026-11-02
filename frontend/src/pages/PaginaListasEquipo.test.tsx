import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { GestionListasEquipo } from './PaginaListasEquipo';
import { apiEquipoEnMemoria, promesaPendiente } from '../testing/listasEquipoApiPruebas';
import type { ListaEquipo, ListasEquipoApi } from '../services/listasEquipo';

function boton(raiz: ReactTestInstance, texto: string) {
  return raiz.findAllByType('button').find((elemento) => elemento.children.some((hijo) => typeof hijo === 'string' && hijo.trim() === texto))!;
}
async function pulsar(raiz: ReactTestInstance, texto: string) {
  await act(async () => { boton(raiz, texto).props.onClick(); });
}
function nombreLista(raiz: ReactTestInstance, nombre: string) {
  act(() => { raiz.findByProps({ placeholder: 'Ej. Equipo de alta montaña' }).props.onChange({ target: { value: nombre } }); });
}
function itemNombre(raiz: ReactTestInstance, indice: number, nombre: string) {
  act(() => { raiz.findAllByProps({ placeholder: 'Ej. Casco' })[indice].props.onChange({ target: { value: nombre } }); });
}
async function enviar(raiz: ReactTestInstance) {
  await act(async () => { raiz.findByType('form').props.onSubmit({ preventDefault() {} }); });
}

async function preparar(t: TestContext, api: ListasEquipoApi) {
  const anteriorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const anteriorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const eventos = Object.assign(new EventTarget(), { confirm: (_mensaje: string): boolean => true });
  const navegador = { onLine: true };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: eventos });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navegador });
  let arbol!: ReactTestRenderer;
  await act(async () => { arbol = create(<MemoryRouter><GestionListasEquipo api={api} /></MemoryRouter>); });
  t.after(() => {
    act(() => arbol.unmount());
    if (anteriorWindow) Object.defineProperty(globalThis, 'window', anteriorWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (anteriorNavigator) Object.defineProperty(globalThis, 'navigator', anteriorNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  return { arbol, raiz: arbol.root, eventos, navegador };
}

describe('Pantalla HU-30: React sin navegador', () => {
  it('muestra el estado vacío y permite crear una lista sin ítems', async (t) => {
    const api = apiEquipoEnMemoria();
    const { raiz, arbol } = await preparar(t, api);
    assert.match(JSON.stringify(arbol.toJSON()), /Aún no tienes listas/);
    await pulsar(raiz, 'Nueva lista');
    nombreLista(raiz, '  Montaña  ');
    await enviar(raiz);
    assert.equal(raiz.findAllByType('form').length, 0);
    assert.equal((await api.listar())[0].nombre, 'Montaña');
    assert.deepEqual((await api.listar())[0].items, []);
    assert.match(JSON.stringify(arbol.toJSON()), /Lista guardada/);
  });

  it('muestra errores de nombres sin enviar datos y deja quitar un ítem vacío', async (t) => {
    const api = apiEquipoEnMemoria();
    const { raiz, arbol } = await preparar(t, api);
    await pulsar(raiz, 'Nueva lista');
    nombreLista(raiz, '  ');
    await pulsar(raiz, 'Añadir ítem');
    await enviar(raiz);
    assert.match(JSON.stringify(arbol.toJSON()), /Escribe un nombre para la lista/);
    assert.match(JSON.stringify(arbol.toJSON()), /Escribe el nombre del ítem/);
    assert.deepEqual(await api.listar(), []);
    nombreLista(raiz, 'Equipo');
    act(() => { raiz.findByProps({ 'aria-label': 'Quitar ítem 1' }).props.onClick(); });
    await enviar(raiz);
    assert.equal((await api.listar()).length, 1);
  });

  it('guarda ítems obligatorios y opcionales, conservando su orden', async (t) => {
    const api = apiEquipoEnMemoria();
    const { raiz } = await preparar(t, api);
    await pulsar(raiz, 'Nueva lista');
    nombreLista(raiz, 'Equipo');
    await pulsar(raiz, 'Añadir ítem');
    itemNombre(raiz, 0, 'Casco');
    act(() => { raiz.findByProps({ 'aria-label': 'Ítem 1 obligatorio' }).props.onChange({ target: { checked: true } }); });
    await pulsar(raiz, 'Añadir ítem');
    itemNombre(raiz, 1, 'Cámara');
    await enviar(raiz);
    const lista = (await api.listar())[0];
    assert.deepEqual(lista.items.map(({ nombre, obligatorio }) => ({ nombre, obligatorio })), [
      { nombre: 'Casco', obligatorio: true }, { nombre: 'Cámara', obligatorio: false },
    ]);
  });

  it('consulta la versión actual al editar y conserva los ids de los ítems retenidos', async (t) => {
    const api = apiEquipoEnMemoria();
    const original = await api.crear({ nombre: 'Equipo', items: [{ nombre: 'Casco', obligatorio: true }] });
    let consultas = 0;
    const obtener = api.obtener;
    api.obtener = async (id) => { consultas++; return obtener(id); };
    const { raiz } = await preparar(t, api);
    await pulsar(raiz, 'Editar');
    assert.equal(consultas, 1);
    nombreLista(raiz, 'Invierno');
    itemNombre(raiz, 0, 'Casco nuevo');
    await pulsar(raiz, 'Añadir ítem');
    itemNombre(raiz, 1, 'Abrigo');
    await enviar(raiz);
    const guardada = await api.obtener(original.id);
    assert.equal(guardada.nombre, 'Invierno');
    assert.equal(guardada.items[0].id, original.items[0].id);
    assert.equal(guardada.items[0].nombre, 'Casco nuevo');
    assert.notEqual(guardada.items[1].id, original.items[0].id);
  });

  it('cancelar una edición no modifica los datos guardados', async (t) => {
    const api = apiEquipoEnMemoria();
    const lista = await api.crear({ nombre: 'Equipo', items: [{ nombre: 'Casco', obligatorio: true }] });
    const { raiz } = await preparar(t, api);
    await pulsar(raiz, 'Editar');
    nombreLista(raiz, 'Cambio sin guardar');
    itemNombre(raiz, 0, 'Otro casco');
    await pulsar(raiz, 'Cancelar');
    assert.deepEqual(await api.obtener(lista.id), lista);
    assert.equal(raiz.findAllByType('form').length, 0);
  });

  it('un error de guardado conserva el formulario y permite reintentar', async (t) => {
    const api = apiEquipoEnMemoria();
    const crear = api.crear;
    api.crear = async () => { throw new Error('No se pudo guardar.'); };
    const { raiz, arbol } = await preparar(t, api);
    await pulsar(raiz, 'Nueva lista');
    nombreLista(raiz, 'Equipo pendiente');
    await pulsar(raiz, 'Añadir ítem');
    itemNombre(raiz, 0, 'Casco');
    await enviar(raiz);
    assert.match(JSON.stringify(arbol.toJSON()), /No se pudo guardar/);
    assert.equal(raiz.findByProps({ placeholder: 'Ej. Equipo de alta montaña' }).props.value, 'Equipo pendiente');
    assert.equal(raiz.findByProps({ placeholder: 'Ej. Casco' }).props.value, 'Casco');
    api.crear = crear;
    await enviar(raiz);
    assert.equal((await api.listar())[0].nombre, 'Equipo pendiente');
  });

  it('solo elimina después de aceptar la confirmación simulada', async (t) => {
    const api = apiEquipoEnMemoria();
    await api.crear({ nombre: 'Equipo', items: [] });
    const { raiz, eventos } = await preparar(t, api);
    eventos.confirm = () => false;
    await pulsar(raiz, 'Eliminar');
    assert.equal((await api.listar()).length, 1);
    eventos.confirm = () => true;
    await pulsar(raiz, 'Eliminar');
    assert.deepEqual(await api.listar(), []);
  });

  it('mantiene lo escrito al perder conexión y habilita el guardado al reconectar', async (t) => {
    const api = apiEquipoEnMemoria();
    const { raiz, eventos, navegador } = await preparar(t, api);
    await pulsar(raiz, 'Nueva lista');
    nombreLista(raiz, 'Equipo pendiente');
    await act(async () => { navegador.onLine = false; eventos.dispatchEvent(new Event('offline')); });
    assert.equal(boton(raiz, 'Guardar lista').props.disabled, true);
    await enviar(raiz);
    assert.deepEqual(await api.listar(), []);
    await act(async () => { navegador.onLine = true; eventos.dispatchEvent(new Event('online')); });
    assert.equal(raiz.findByProps({ placeholder: 'Ej. Equipo de alta montaña' }).props.value, 'Equipo pendiente');
    await enviar(raiz);
    assert.equal((await api.listar())[0].nombre, 'Equipo pendiente');
  });

  it('distingue la carga pendiente del estado vacío y permite reintentar un fallo', async (t) => {
    const api = apiEquipoEnMemoria();
    const pendiente = promesaPendiente<ListaEquipo[]>();
    const listar = api.listar;
    api.listar = async () => pendiente.promesa;
    const { raiz, arbol } = await preparar(t, api);
    assert.equal(boton(raiz, 'Nueva lista').props.disabled, true);
    assert.match(JSON.stringify(arbol.toJSON()), /Cargando listas/);
    assert.doesNotMatch(JSON.stringify(arbol.toJSON()), /Aún no tienes listas/);
    await act(async () => { pendiente.rechazar(new Error('No se pudieron cargar las listas.')); });
    assert.match(JSON.stringify(arbol.toJSON()), /No se pudieron cargar/);
    api.listar = listar;
    await pulsar(raiz, 'Reintentar');
    assert.match(JSON.stringify(arbol.toJSON()), /Aún no tienes listas/);
  });
});
