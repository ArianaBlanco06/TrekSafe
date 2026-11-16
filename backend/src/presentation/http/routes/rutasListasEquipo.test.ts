import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it, type TestContext } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { EstadoListaEquipo } from '../../../domain/entities/ListaEquipo.js';
import { ServicioListasEquipo } from '../../../application/services/servicioListasEquipo.js';
import { ListasEquipoDAOEnMemoria } from '../../../testing/ListasEquipoDAOEnMemoria.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';
import { crearRutasListasEquipo } from './rutasListasEquipo.js';

const secreto = 'secreto-exclusivo-de-pruebas-http-hu30';
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: secreto, SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', MEDICAL_ENCRYPTION_KEY: 'clave-medica-ficticia-de-32-caracteres',
});
const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const inexistente = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const base = '/api/usuario/listas-equipo';
const entrada = { nombre: 'Montaña', items: [{ nombre: 'Casco', obligatorio: true }] };
type Cuerpo = { lista?: EstadoListaEquipo; listas?: EstadoListaEquipo[]; codigo?: string; mensaje?: string };

function token(actor = actorA, rol = 'senderista'): string {
  return jwt.sign({ sub: actor, rol }, secreto, { expiresIn: '1h' });
}

async function preparar(t: TestContext) {
  const dao = new ListasEquipoDAOEnMemoria();
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(base, crearRutasListasEquipo(new ServicioListasEquipo(dao)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    servidor.closeAllConnections();
    servidor.close((err) => err ? reject(err) : resolve());
  }));
  const direccion = servidor.address();
  assert.ok(direccion && typeof direccion !== 'string');
  const puerto = direccion.port;
  async function pedir(metodo: string, ruta = '', datos?: unknown, credencial: string | null = token()) {
    const respuesta = await fetch(`http://127.0.0.1:${puerto}${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(credencial === null ? {} : { Authorization: `Bearer ${credencial}` }) },
      ...(datos === undefined ? {} : { body: JSON.stringify(datos) }),
    });
    const cuerpo = respuesta.status === 204 ? {} : await respuesta.json() as Cuerpo;
    return { estado: respuesta.status, cuerpo };
  }
  return { dao, pedir, puerto };
}

describe('API HU-30 con JWT real y DAO en memoria', () => {
  it('crea, lista, consulta, edita y elimina una lista con los códigos HTTP esperados', async (t) => {
    const { pedir } = await preparar(t);
    const creada = await pedir('POST', '', entrada);
    assert.equal(creada.estado, 201);
    const lista = creada.cuerpo.lista;
    assert.ok(lista);
    assert.equal(lista.senderistaId, actorA);
    assert.equal((await pedir('GET')).cuerpo.listas?.length, 1);
    assert.deepEqual((await pedir('GET', `/${lista.id}`)).cuerpo.lista, lista);
    const editada = await pedir('PUT', `/${lista.id}`, { nombre: 'Invierno', items: [] });
    assert.equal(editada.estado, 200);
    assert.equal(editada.cuerpo.lista?.nombre, 'Invierno');
    assert.deepEqual(editada.cuerpo.lista?.items, []);
    assert.equal((await pedir('DELETE', `/${lista.id}`)).estado, 204);
    assert.equal((await pedir('GET', `/${lista.id}`)).estado, 404);
    assert.equal((await pedir('DELETE', `/${lista.id}`)).estado, 404);
  });

  it('permite crear una lista inicialmente vacía', async (t) => {
    const { pedir } = await preparar(t);
    const respuesta = await pedir('POST', '', { nombre: 'Por completar', items: [] });
    assert.equal(respuesta.estado, 201);
    assert.deepEqual(respuesta.cuerpo.lista?.items, []);
  });

  it('rechaza ausencia de sesión, token inválido, expirado y rol rescatista', async (t) => {
    const { pedir } = await preparar(t);
    assert.equal((await pedir('GET', '', undefined, null)).estado, 401);
    assert.equal((await pedir('GET', '', undefined, 'alterado')).estado, 401);
    const expirado = jwt.sign({ sub: actorA, rol: 'senderista' }, secreto, { expiresIn: -1 });
    assert.equal((await pedir('GET', '', undefined, expirado)).estado, 401);
    assert.equal((await pedir('GET', '', undefined, token(actorA, 'rescatista'))).estado, 403);
    assert.equal((await pedir('POST', '', entrada, token(actorA, 'rescatista'))).estado, 403);
  });

  it('oculta listas ajenas al consultar, editar y eliminar', async (t) => {
    const { pedir } = await preparar(t);
    const creada = (await pedir('POST', '', entrada)).cuerpo.lista!;
    assert.deepEqual((await pedir('GET', '', undefined, token(actorB))).cuerpo.listas, []);
    for (const metodo of ['GET', 'PUT', 'DELETE']) {
      const respuesta = await pedir(metodo, `/${creada.id}`, metodo === 'PUT' ? entrada : undefined, token(actorB));
      assert.equal(respuesta.estado, 404);
      assert.equal(respuesta.cuerpo.codigo, 'LISTA_EQUIPO_NO_ENCONTRADA');
    }
    assert.deepEqual((await pedir('GET', `/${creada.id}`)).cuerpo.lista, creada);
    assert.equal((await pedir('GET', `/${inexistente}`)).estado, 404);
  });

  it('rechaza identificadores malformados sin llegar a la persistencia', async (t) => {
    const { pedir } = await preparar(t);
    for (const metodo of ['GET', 'PUT', 'DELETE']) {
      assert.equal((await pedir(metodo, '/no-es-uuid', metodo === 'PUT' ? entrada : undefined)).estado, 400);
    }
  });

  it('rechaza tipos incorrectos y campos que intentan asignar propietario o identidad', async (t) => {
    const { pedir } = await preparar(t);
    const invalidas = [
      { ...entrada, senderistaId: actorB }, { ...entrada, id: inexistente },
      { ...entrada, items: [{ nombre: 'Casco', obligatorio: 'false' }] },
      { ...entrada, items: [{ ...entrada.items[0], id: inexistente }] },
      { nombre: 'Montaña', items: null }, { nombre: 'Montaña' },
    ];
    for (const datos of invalidas) assert.equal((await pedir('POST', '', datos)).estado, 400);
    assert.deepEqual((await pedir('GET')).cuerpo.listas, []);
  });

  it('traduce errores de negocio y conserva la lista ante una edición inválida', async (t) => {
    const { pedir } = await preparar(t);
    const invalida = await pedir('POST', '', { nombre: ' \t ', items: [] });
    assert.equal(invalida.estado, 400);
    assert.equal(invalida.cuerpo.codigo, 'NOMBRE_LISTA_INVALIDO');
    const lista = (await pedir('POST', '', entrada)).cuerpo.lista!;
    const respuesta = await pedir('PUT', `/${lista.id}`, { nombre: 'Invierno', items: [{ nombre: '', obligatorio: true }] });
    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.codigo, 'NOMBRE_ITEM_INVALIDO');
    assert.deepEqual((await pedir('GET', `/${lista.id}`)).cuerpo.lista, lista);
    assert.equal((await pedir('PUT', `/${lista.id}`, { ...entrada, senderistaId: actorB })).estado, 400);
  });

  it('rechaza ítems ajenos y duplicados sin alterar ninguna lista', async (t) => {
    const { pedir } = await preparar(t);
    const lista = (await pedir('POST', '', entrada)).cuerpo.lista!;
    const otra = (await pedir('POST', '', entrada)).cuerpo.lista!;
    const ajena = await pedir('PUT', `/${lista.id}`, { nombre: 'Invierno', items: otra.items });
    assert.equal(ajena.estado, 400);
    assert.equal(ajena.cuerpo.codigo, 'ITEM_NO_PERTENECE');
    const duplicada = await pedir('PUT', `/${lista.id}`, { nombre: 'Invierno', items: [lista.items[0], lista.items[0]] });
    assert.equal(duplicada.estado, 400);
    assert.equal(duplicada.cuerpo.codigo, 'ITEM_DUPLICADO');
    assert.deepEqual((await pedir('GET', `/${lista.id}`)).cuerpo.lista, lista);
  });

  it('devuelve 400 ante un cuerpo JSON malformado', async (t) => {
    const { puerto } = await preparar(t);
    const respuesta = await fetch(`http://127.0.0.1:${puerto}${base}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: '{',
    });
    assert.equal(respuesta.status, 400);
  });
});
