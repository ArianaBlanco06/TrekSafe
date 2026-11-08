import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/ContextoAutenticacion';
import { PaginaCrearExpedicion } from '../pages/PaginaCrearExpedicion';
import { PaginaHistorialExpediciones } from '../pages/PaginaHistorialExpediciones';
import { isoADatetimeLocal } from '../lib/fechaLocal';
import { vaciarContactosEnMemoria } from '../lib/offlineContacts';
import type { BorradorDesdeHistorial, DatosCrearExpedicion } from '../services/expedicion';
import { promesaPendiente } from './listasEquipoApiPruebas';

const origenId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const nuevaId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contactoId = '11111111-1111-4111-8111-111111111111';
const rutaNueva = `/senderista/expedicion/nueva?repetir=${origenId}`;
const horaFutura = (dias: number) => isoADatetimeLocal(new Date(Date.now() + dias * 86_400_000).toISOString());
const MapaPruebas = () => null;

function almacenamiento() {
  const datos = new Map<string, string>();
  return { datos, getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => { datos.set(clave, valor); }, removeItem: (clave: string) => { datos.delete(clave); } };
}

async function preparar(t: TestContext) {
  const anteriorFetch = globalThis.fetch;
  const nombres = ['window', 'navigator', 'sessionStorage', 'localStorage', 'caches'];
  const anteriores = new Map(nombres.map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
  const sesion = almacenamiento();
  const local = almacenamiento();
  sesion.setItem('treksafe:token', 'token-ficticio-A');
  sesion.setItem('treksafe:usuario', JSON.stringify({ id: actorA, correoElectronico: 'a@example.invalid', rol: 'senderista' }));
  const eventos = new EventTarget();
  const navegador = { onLine: true };
  for (const [nombre, valor] of Object.entries({ window: eventos, navigator: navegador, sessionStorage: sesion, localStorage: local, caches: undefined })) {
    Object.defineProperty(globalThis, nombre, { configurable: true, value: valor });
  }
  vaciarContactosEnMemoria();
  const borrador: BorradorDesdeHistorial = {
    origen: 'historial', origenId, descripcionOrigen: 'Expedición completada «Laguna 69»',
    lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69', coordenadasInicio: '-9.04700, -77.60900',
    coordenadasFin: '-9.01050, -77.60420', minutosTolerancia: 45,
    idsContactos: [contactoId], cantidadContactosNoVigentes: 1, nombresAcompanantes: ['Ana Torres'],
    horaInicio: null, horaRetornoEstimada: null, requiereFechasNuevas: true,
  };
  const completada = { id: origenId, lugarInicio: borrador.lugarInicio, lugarFin: borrador.lugarFin,
    horaInicio: '2025-01-10T08:00:00Z', horaRetornoEstimada: '2025-01-10T18:00:00Z',
    minutosTolerancia: 45, estado: 'completada', version: 1, creadoEn: '2025-01-01T12:00:00Z' };
  const api = {
    contactos: [{ id: contactoId, nombreCompleto: 'Contacto vigente', correoElectronico: 'contacto@example.invalid',
      parentesco: 'Familiar', telefono: '+51900000001' }],
    responderBorrador: async () => Response.json({ borrador }),
    responderContactos: async (): Promise<Response> => Response.json({ contactos: api.contactos }),
    responderCreacion: async (datos: DatosCrearExpedicion): Promise<Response> =>
      Response.json({ expedicion: { ...datos, id: nuevaId, estado: 'programada', version: 1, creadoEn: new Date().toISOString() } }, { status: 201 }),
  };
  const peticiones: { ruta: string; opciones?: RequestInit }[] = [];
  globalThis.fetch = async (input, opciones) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    peticiones.push({ ruta: url.pathname, opciones });
    if (url.pathname === `/api/expediciones/${origenId}/borrador`) return api.responderBorrador();
    if (url.pathname === '/api/usuario/contactos') return api.responderContactos();
    if (url.pathname === '/api/expediciones/historial') return Response.json({ expediciones: [completada],
      estadisticas: { totalCompletadas: 1, destinosUnicos: 1, promedioHoras: 10, ultimaCompletadaEn: completada.horaRetornoEstimada } });
    if (url.pathname === '/api/expediciones' && opciones?.method === 'POST') {
      return api.responderCreacion(JSON.parse(String(opciones.body)) as DatosCrearExpedicion);
    }
    assert.fail(`Solicitud inesperada en la prueba local: ${url.pathname}`);
  };
  let arbol: ReactTestRenderer | undefined;
  t.after(() => {
    if (arbol) act(() => arbol!.unmount());
    vaciarContactosEnMemoria();
    globalThis.fetch = anteriorFetch;
    for (const [nombre, descriptor] of anteriores) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else Reflect.deleteProperty(globalThis, nombre);
    }
  });
  async function montar(ruta = rutaNueva) {
    await act(async () => {
      arbol = create(<MemoryRouter initialEntries={[ruta]}><AuthProvider><Routes>
        <Route path="/senderista/perfil/historial" element={<PaginaHistorialExpediciones />} />
        <Route path="/senderista/expedicion/nueva" element={<PaginaCrearExpedicion Mapa={MapaPruebas} />} />
        <Route path="/senderista/expedicion" element={<h2>Expedición nueva registrada</h2>} />
      </Routes></AuthProvider></MemoryRouter>);
    });
    return arbol!;
  }
  async function conexion(enLinea: boolean) {
    await act(async () => { navegador.onLine = enLinea; eventos.dispatchEvent(new Event(enLinea ? 'online' : 'offline')); });
  }
  return { montar, raiz: () => arbol!.root, texto: () => JSON.stringify(arbol!.toJSON()), conexion,
    borrador, completada, api, peticiones, sesion, local,
    escrituras: () => peticiones.filter((peticion) => peticion.opciones?.method === 'POST') };
}

function cambiar(raiz: ReactTestInstance, id: string, valor: string | boolean) {
  act(() => { raiz.findByProps({ id }).props.onChange({ target: typeof valor === 'boolean' ? { checked: valor } : { value: valor } }); });
}
async function enviar(raiz: ReactTestInstance) {
  await act(async () => { await raiz.findByType('form').props.onSubmit({ preventDefault() {} }); });
}
function boton(raiz: ReactTestInstance, texto: string) {
  return raiz.findAllByType('button').find((elemento) => elemento.children.some((hijo) => typeof hijo === 'string' && hijo.trim() === texto))!;
}
function completarFechas(raiz: ReactTestInstance) {
  cambiar(raiz, 'exp-hora-inicio', horaFutura(1));
  cambiar(raiz, 'exp-hora-retorno', horaFutura(2));
}

describe('HU-28: historial y formulario con React y HTTP sustituido', () => {
  it('el enlace del historial abre un borrador autorizado sin registrar una expedición', async (t) => {
    const e = await preparar(t);
    await e.montar('/senderista/perfil/historial');
    const enlace = e.raiz().findAllByType('a').find((elemento) => elemento.props['aria-label'] === 'Repetir expedición a Laguna 69')!;
    assert.equal(enlace.props.href, rutaNueva);
    await act(async () => { enlace.props.onClick({ button: 0, defaultPrevented: false, preventDefault() {}, metaKey: false, altKey: false, ctrlKey: false, shiftKey: false }); });
    assert.equal(e.raiz().findByProps({ id: 'exp-lugar-inicio' }).props.value, 'Cebollapampa');
    assert.equal(e.raiz().findByProps({ id: 'exp-lugar-fin' }).props.value, 'Laguna 69');
    assert.equal(e.raiz().findByProps({ id: 'exp-hora-inicio' }).props.value, '');
    assert.equal(e.raiz().findByProps({ id: 'exp-hora-retorno' }).props.value, '');
    assert.equal(e.raiz().findByProps({ id: 'exp-tolerancia' }).props.value, 45);
    assert.match(e.texto(), /Ruta cargada desde tu historial/);
    assert.match(e.texto(), /ya no están disponibles/);
    const peticion = e.peticiones.find((peticion) => peticion.ruta.endsWith('/borrador'))!;
    assert.equal(peticion.opciones?.cache, 'no-store');
    assert.equal((peticion.opciones?.headers as Record<string, string>).Authorization, 'Bearer token-ficticio-A');
    assert.equal(e.escrituras().length, 0);
    assert.equal(e.local.datos.size, 0);
  });

  it('exige fechas nuevas y revisión de contactos y envía solo los datos de la nueva expedición', async (t) => {
    const e = await preparar(t);
    const original = structuredClone(e.borrador);
    await e.montar();
    assert.equal(boton(e.raiz(), 'Registrar expedición').props.disabled, true);
    await enviar(e.raiz());
    completarFechas(e.raiz());
    assert.equal(boton(e.raiz(), 'Registrar expedición').props.disabled, true);
    await enviar(e.raiz());
    assert.equal(e.escrituras().length, 0);
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    assert.equal(boton(e.raiz(), 'Registrar expedición').props.disabled, false);
    await enviar(e.raiz());
    assert.equal(e.escrituras().length, 1);
    const payload = JSON.parse(String(e.escrituras()[0].opciones?.body)) as DatosCrearExpedicion;
    assert.deepEqual(Object.keys(payload).sort(), ['lugarInicio', 'lugarFin', 'coordenadasInicio', 'coordenadasFin',
      'horaInicio', 'horaRetornoEstimada', 'minutosTolerancia', 'minutosRecordatorio', 'idsContactos', 'nombresAcompanantes'].sort());
    assert.deepEqual(payload.idsContactos, [contactoId]);
    assert.deepEqual(payload.nombresAcompanantes, ['Ana Torres']);
    assert.ok(Date.parse(payload.horaInicio) > Date.now());
    assert.ok(Date.parse(payload.horaRetornoEstimada) > Date.parse(payload.horaInicio));
    assert.match(e.texto(), /Expedición nueva registrada/);
    assert.deepEqual(e.borrador, original);
  });

  it('rechaza fechas pasadas y retorno anterior a la salida', async (t) => {
    const e = await preparar(t);
    await e.montar();
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    cambiar(e.raiz(), 'exp-hora-inicio', '2020-01-10T08:00');
    cambiar(e.raiz(), 'exp-hora-retorno', '2020-01-10T18:00');
    await enviar(e.raiz());
    assert.match(e.texto(), /salida futura/);
    cambiar(e.raiz(), 'exp-hora-inicio', horaFutura(2));
    cambiar(e.raiz(), 'exp-hora-retorno', horaFutura(1));
    await enviar(e.raiz());
    assert.match(e.texto(), /retorno debe ser posterior/);
    assert.equal(e.escrituras().length, 0);
  });

  it('retira sugerencias de contactos que ya no aparecen al cargar el formulario', async (t) => {
    const e = await preparar(t);
    const desaparecido = '22222222-2222-4222-8222-222222222222';
    e.borrador.idsContactos.push(desaparecido);
    await e.montar();
    completarFechas(e.raiz());
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    await enviar(e.raiz());
    assert.deepEqual(JSON.parse(String(e.escrituras()[0].opciones?.body)).idsContactos, [contactoId]);
  });

  it('conserva el borrador cuando falla el guardado y permite reintentar', async (t) => {
    const e = await preparar(t);
    const guardar = e.api.responderCreacion;
    e.api.responderCreacion = async () => Response.json({ mensaje: 'No se pudo registrar.' }, { status: 500 });
    await e.montar();
    cambiar(e.raiz(), 'exp-lugar-fin', 'Destino corregido');
    completarFechas(e.raiz());
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    await enviar(e.raiz());
    assert.match(e.texto(), /No se pudo registrar/);
    assert.equal(e.raiz().findByProps({ id: 'exp-lugar-fin' }).props.value, 'Destino corregido');
    assert.equal(e.raiz().findByProps({ id: 'exp-contactos-revisados' }).props.checked, true);
    e.api.responderCreacion = guardar;
    await enviar(e.raiz());
    assert.equal(e.escrituras().length, 2);
    assert.match(e.texto(), /Expedición nueva registrada/);
  });

  it('bloquea dos envíos mientras el registro está pendiente', async (t) => {
    const e = await preparar(t);
    const guardar = e.api.responderCreacion;
    const pendiente = promesaPendiente<Response>();
    e.api.responderCreacion = async () => pendiente.promesa;
    await e.montar();
    completarFechas(e.raiz());
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    let registro!: Promise<void>;
    act(() => { registro = e.raiz().findByType('form').props.onSubmit({ preventDefault() {} }); });
    await enviar(e.raiz());
    assert.equal(e.escrituras().length, 1);
    assert.equal(boton(e.raiz(), 'Registrando…').props.disabled, true);
    await act(async () => { pendiente.resolver(await guardar(JSON.parse(String(e.escrituras()[0].opciones?.body)))); await registro; });
    assert.match(e.texto(), /Expedición nueva registrada/);
  });

  it('muestra el fallo de preparación sin formulario y permite reintentar', async (t) => {
    const e = await preparar(t);
    const obtener = e.api.responderBorrador;
    e.api.responderBorrador = async () => Response.json({ mensaje: 'Expedición completada no encontrada' }, { status: 404 });
    await e.montar();
    assert.equal(e.raiz().findAllByType('form').length, 0);
    assert.match(e.texto(), /Expedición completada no encontrada/);
    assert.equal(e.escrituras().length, 0);
    e.api.responderBorrador = obtener;
    await act(async () => { boton(e.raiz(), 'Reintentar').props.onClick(); });
    assert.equal(e.raiz().findAllByType('form').length, 1);
  });

  it('no permite confirmar contactos si falla su carga y ofrece reintentar', async (t) => {
    const e = await preparar(t);
    const obtener = e.api.responderContactos;
    e.api.responderContactos = async () => Response.json({ mensaje: 'Fallo de contactos' }, { status: 500 });
    await e.montar();
    completarFechas(e.raiz());
    assert.equal(e.raiz().findByProps({ id: 'exp-contactos-revisados' }).props.disabled, true);
    assert.equal(boton(e.raiz(), 'Registrar expedición').props.disabled, true);
    assert.match(e.texto(), /No pudimos cargar tus contactos/);
    e.api.responderContactos = obtener;
    await act(async () => { boton(e.raiz(), 'Reintentar contactos').props.onClick(); });
    assert.equal(e.raiz().findByProps({ id: 'exp-contactos-revisados' }).props.disabled, false);
  });

  it('reconectar conserva lo escrito y no vuelve a cargar el origen', async (t) => {
    const e = await preparar(t);
    await e.montar();
    cambiar(e.raiz(), 'exp-lugar-fin', 'Cambio todavía sin guardar');
    completarFechas(e.raiz());
    await e.conexion(false);
    await e.conexion(true);
    assert.equal(e.raiz().findByProps({ id: 'exp-lugar-fin' }).props.value, 'Cambio todavía sin guardar');
    assert.equal(e.raiz().findByProps({ id: 'exp-hora-inicio' }).props.value, horaFutura(1));
    assert.equal(e.peticiones.filter((peticion) => peticion.ruta.endsWith('/borrador')).length, 1);
    assert.equal(e.escrituras().length, 0);
  });

  it('cambiar la selección de contactos exige volver a confirmar su revisión', async (t) => {
    const e = await preparar(t);
    await e.montar();
    completarFechas(e.raiz());
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    const contacto = () => e.raiz().findAllByType('input').find((campo) =>
      campo.props.type === 'checkbox' && campo.props.id !== 'exp-contactos-revisados')!;
    act(() => { contacto().props.onChange(); });
    act(() => { contacto().props.onChange(); });
    assert.equal(e.raiz().findByProps({ id: 'exp-contactos-revisados' }).props.checked, false);
    assert.equal(boton(e.raiz(), 'Registrar expedición').props.disabled, true);
    await enviar(e.raiz());
    assert.equal(e.escrituras().length, 0);
  });

  it('permite guardar explícitamente un borrador offline de la misma sesión después de revisarlo', async (t) => {
    const e = await preparar(t);
    await e.montar();
    completarFechas(e.raiz());
    await e.conexion(false);
    cambiar(e.raiz(), 'exp-contactos-revisados', true);
    assert.equal(boton(e.raiz(), 'Guardar borrador offline').props.disabled, false);
    await enviar(e.raiz());
    assert.match(e.texto(), /Borrador guardado para sincronizar/);
    const entrada = [...e.local.datos.entries()].find(([clave]) => clave.endsWith(':expedition-drafts'))!;
    assert.ok(entrada);
    const borradores = JSON.parse(entrada[1]) as { id: string; horaInicio: string; idsContactos: string[] }[];
    assert.equal(borradores.length, 1);
    assert.notEqual(borradores[0].id, origenId);
    assert.deepEqual(borradores[0].idsContactos, [contactoId]);
    assert.ok(Date.parse(borradores[0].horaInicio) > Date.now());
    assert.equal(e.escrituras().length, 0);
  });

  it('descarta el borrador tardío cuando cambia la sesión', async (t) => {
    const e = await preparar(t);
    const pendiente = promesaPendiente<Response>();
    e.api.responderBorrador = async () => pendiente.promesa;
    await e.montar();
    assert.equal(e.raiz().findAllByType('form').length, 0);
    e.sesion.setItem('treksafe:token', 'token-ficticio-B');
    e.sesion.setItem('treksafe:usuario', JSON.stringify({ id: 'otro-usuario', rol: 'senderista' }));
    e.sesion.removeItem('treksafe:offline-scope');
    await act(async () => { pendiente.resolver(Response.json({ borrador: e.borrador })); });
    assert.equal(e.raiz().findAllByType('form').length, 0);
    assert.doesNotMatch(e.texto(), /Laguna 69/);
    assert.equal(e.local.datos.size, 0);
  });

  it('mantiene la creación ordinaria vacía y sin revisión adicional de historial', async (t) => {
    const e = await preparar(t);
    await e.montar('/senderista/expedicion/nueva');
    assert.equal(e.raiz().findByProps({ id: 'exp-lugar-inicio' }).props.value, '');
    assert.equal(e.raiz().findAllByProps({ id: 'exp-contactos-revisados' }).length, 0);
    assert.equal(e.peticiones.some((peticion) => peticion.ruta.endsWith('/borrador')), false);
  });

  it('oculta el enlace de repetir cuando el historial abierto pierde la conexión', async (t) => {
    const e = await preparar(t);
    await e.montar('/senderista/perfil/historial');
    await e.conexion(false);
    assert.equal(e.raiz().findAllByType('a').some((enlace) => enlace.props.href.includes('?repetir=')), false);
    assert.match(e.texto(), /Conéctate para repetir/);
  });
});
