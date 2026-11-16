import assert from 'node:assert/strict';
import { it } from 'node:test';
import { listasEquipoApi } from './listasEquipo';

it('el cliente envía JWT y evita caché en lecturas; conserva ids solo en la edición', async (t) => {
  const anteriorFetch = globalThis.fetch;
  const anteriorStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const peticiones: { ruta: string; opciones?: RequestInit }[] = [];
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true,
    value: { getItem: () => 'token-ficticio' } });
  globalThis.fetch = async (input, opciones) => {
    peticiones.push({ ruta: String(input), opciones });
    if (opciones?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ listas: [], lista: { id: 'guardada' } });
  };
  t.after(() => {
    globalThis.fetch = anteriorFetch;
    if (anteriorStorage) Object.defineProperty(globalThis, 'sessionStorage', anteriorStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  await listasEquipoApi.listar();
  await listasEquipoApi.obtener('lista');
  await listasEquipoApi.crear({ nombre: 'Equipo', items: [{ nombre: 'Casco', obligatorio: true }] });
  await listasEquipoApi.actualizar('lista', { nombre: 'Invierno', items: [{ id: 'casco', nombre: 'Casco', obligatorio: false }] });
  await listasEquipoApi.eliminar('lista');
  for (const peticion of peticiones) {
    assert.equal((peticion.opciones?.headers as Record<string, string>).Authorization, 'Bearer token-ficticio');
  }
  assert.equal(peticiones[0].opciones?.cache, 'no-store');
  assert.equal(peticiones[1].opciones?.cache, 'no-store');
  assert.equal(peticiones[2].opciones?.method, 'POST');
  assert.equal('id' in JSON.parse(String(peticiones[2].opciones?.body)).items[0], false);
  assert.equal(JSON.parse(String(peticiones[3].opciones?.body)).items[0].id, 'casco');
  assert.equal(peticiones[4].opciones?.method, 'DELETE');
});
