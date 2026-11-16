import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it, type TestContext } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { CreadorDesdeHistorial } from '../../../application/creacion-plan/CreadorDesdeHistorial.js';
import type { BorradorPlan } from '../../../application/creacion-plan/CreadorPlan.js';
import type { IContactosVigentes } from '../../../domain/repositories/IContactosVigentes.js';
import type { ExpedicionParaRepetir, IHistorialExpedicionesDAO } from '../../../domain/repositories/IHistorialExpedicionesDAO.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';
import { crearRutasRepetirExpedicion } from './rutasRepetirExpedicion.js';

const secreto = 'secreto-ficticio-exclusivo-pruebas-hu28';
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: secreto, SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', MEDICAL_ENCRYPTION_KEY: 'clave-medica-ficticia-de-32-caracteres',
});
const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origenId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const origenAjenoId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const contactoVigente = '11111111-1111-4111-8111-111111111111';
const contactoBorrado = '22222222-2222-4222-8222-222222222222';

function token(actor = actorA, rol = 'senderista') {
  return jwt.sign({ sub: actor, rol }, secreto, { expiresIn: '1h' });
}

async function preparar(t: TestContext) {
  const origen = {
    id: origenId, senderistaId: actorA, estado: 'completada',
    lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69', coordenadasInicio: null,
    coordenadasFin: '-9.01050, -77.60420', minutosTolerancia: 45,
    idsContactos: [contactoVigente, contactoBorrado], nombresAcompanantes: ['Ana Torres'],
    horaInicio: '2025-01-10T08:00:00Z', horaRetornoEstimada: '2025-01-10T18:00:00Z',
    fichaMedica: 'dato-ficticio', alertas: ['alerta-anterior'], confirmadoEn: '2025-01-10T17:00:00Z',
  };
  const filas = new Map<string, ExpedicionParaRepetir>([
    [origenId, origen], [origenAjenoId, { ...origen, id: origenAjenoId, senderistaId: actorB }],
  ]);
  const vigentes = new Set<string>([contactoVigente]);
  const consultas: { actor: string; id: string }[] = [];
  const historial: IHistorialExpedicionesDAO = {
    async buscarPorId(actor, id) {
      consultas.push({ actor, id });
      const fila = filas.get(id);
      return fila?.senderistaId === actor ? structuredClone(fila) : null;
    },
  };
  const contactos: IContactosVigentes = {
    async filtrarVigentes(actor, ids) {
      assert.equal(actor, actorA);
      return ids.filter((id) => vigentes.has(id));
    },
  };
  const app = express();
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/expediciones', crearRutasRepetirExpedicion(new CreadorDesdeHistorial(contactos, historial)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  });
  const direccion = servidor.address();
  assert.ok(direccion && typeof direccion !== 'string');
  const puerto = direccion.port;
  async function pedirRuta(ruta: string, credencial: string | null = token(), metodo = 'GET') {
    const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/expediciones${ruta}`, {
      method: metodo, headers: credencial === null ? {} : { Authorization: `Bearer ${credencial}` },
    });
    return { estado: respuesta.status, cache: respuesta.headers.get('cache-control'),
      cuerpo: await respuesta.json() as { borrador?: BorradorPlan; codigo?: string; mensaje?: string } };
  }
  const pedir = (id = origenId, credencial: string | null = token(), query = '') =>
    pedirRuta(`/${id}/borrador${query}`, credencial);
  return { pedir, pedirRuta, filas, origen, consultas, vigentes, historial, contactos };
}

describe('API HU-28: Express y JWT reales con consultas sustitutas', () => {
  it('devuelve el borrador privado con fechas vacías sin crear ni modificar expediciones', async (t) => {
    const e = await preparar(t);
    const original = structuredClone(e.origen);
    const respuesta = await e.pedir();
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cache, 'no-store');
    assert.deepEqual(Object.keys(respuesta.cuerpo), ['borrador']);
    const borrador = respuesta.cuerpo.borrador!;
    assert.equal(borrador.origen, 'historial');
    assert.equal(borrador.origenId, origenId);
    assert.equal(borrador.lugarInicio, original.lugarInicio);
    assert.equal(borrador.lugarFin, original.lugarFin);
    assert.equal(borrador.coordenadasFin, original.coordenadasFin);
    assert.equal(borrador.horaInicio, null);
    assert.equal(borrador.horaRetornoEstimada, null);
    assert.equal(borrador.requiereFechasNuevas, true);
    assert.deepEqual(borrador.idsContactos, [contactoVigente]);
    assert.equal(borrador.cantidadContactosNoVigentes, 1);
    for (const campo of ['id', 'senderistaId', 'estado', 'fichaMedica', 'alertas', 'confirmadoEn']) {
      assert.equal(Object.hasOwn(borrador, campo), false);
    }
    assert.deepEqual((await e.pedir()).cuerpo, respuesta.cuerpo);
    assert.deepEqual(e.filas.get(origenId), original);
    assert.equal(e.filas.size, 2);
  });

  it('rechaza ausencia de sesión, JWT inválido o expirado y rol rescatista antes de consultar', async (t) => {
    const e = await preparar(t);
    const expirado = jwt.sign({ sub: actorA, rol: 'senderista' }, secreto, { expiresIn: -1 });
    for (const [credencial, estado] of [[null, 401], ['alterado', 401], [expirado, 401], [token(actorA, 'rescatista'), 403]] as const) {
      const respuesta = await e.pedir(origenId, credencial);
      assert.equal(respuesta.estado, estado);
      assert.equal(respuesta.cache, 'no-store');
    }
    assert.deepEqual(e.consultas, []);
  });

  it('valida el UUID antes de consultar el historial', async (t) => {
    const e = await preparar(t);
    assert.equal((await e.pedir('no-es-un-uuid')).estado, 400);
    assert.deepEqual(e.consultas, []);
  });

  it('responde igual para un origen ajeno y uno inexistente', async (t) => {
    const e = await preparar(t);
    const ajeno = await e.pedir(origenAjenoId);
    const inexistente = await e.pedir('ffffffff-ffff-4fff-8fff-ffffffffffff');
    assert.equal(ajeno.estado, 404);
    assert.equal(inexistente.estado, 404);
    assert.deepEqual(ajeno.cuerpo, inexistente.cuerpo);
    assert.equal(ajeno.cuerpo.codigo, 'EXPEDICION_HISTORIAL_NO_ENCONTRADA');
    assert.equal(ajeno.cuerpo.borrador, undefined);
  });

  for (const estado of ['programada', 'en_progreso', 'alerta', 'cancelada']) {
    it(`rechaza una expedición ${estado}`, async (t) => {
      const e = await preparar(t);
      e.filas.set(origenId, { ...e.origen, estado });
      assert.equal((await e.pedir()).estado, 404);
    });
  }

  it('obtiene el propietario del JWT e ignora el intento de sustituirlo por query', async (t) => {
    const e = await preparar(t);
    const respuesta = await e.pedir(origenId, token(actorB), `?senderistaId=${actorA}`);
    assert.equal(respuesta.estado, 404);
    assert.deepEqual(e.consultas, [{ actor: actorB, id: origenId }]);
  });

  it('vuelve a comprobar los contactos vigentes en cada solicitud', async (t) => {
    const e = await preparar(t);
    assert.deepEqual((await e.pedir()).cuerpo.borrador?.idsContactos, [contactoVigente]);
    e.vigentes.delete(contactoVigente);
    const respuesta = await e.pedir();
    assert.deepEqual(respuesta.cuerpo.borrador?.idsContactos, []);
    assert.equal(respuesta.cuerpo.borrador?.cantidadContactosNoVigentes, 2);
  });

  it('rechaza un fallo de consulta sin filtrar detalles ni devolver un borrador parcial', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const e = await preparar(t);
    e.historial.buscarPorId = async () => {
      throw new ErrorAplicacion(500, 'No se pudo consultar el historial de expediciones.', 'HISTORIAL_NO_DISPONIBLE');
    };
    const falloHistorial = await e.pedir();
    assert.equal(falloHistorial.estado, 500);
    assert.equal(falloHistorial.cuerpo.codigo, 'HISTORIAL_NO_DISPONIBLE');
    assert.equal(falloHistorial.cuerpo.borrador, undefined);
    e.historial.buscarPorId = async () => e.origen;
    e.contactos.filtrarVigentes = async () => { throw new Error('detalle-interno-ficticio'); };
    const falloContactos = await e.pedir();
    assert.equal(falloContactos.estado, 500);
    assert.equal(falloContactos.cuerpo.borrador, undefined);
    assert.doesNotMatch(JSON.stringify(falloContactos.cuerpo), /detalle-interno/);
    assert.deepEqual(e.filas.get(origenId), e.origen);
  });

  it('no acepta escrituras ni intercepta otras rutas de expediciones', async (t) => {
    const e = await preparar(t);
    assert.equal((await e.pedirRuta(`/${origenId}/borrador`, token(), 'POST')).estado, 404);
    assert.equal((await e.pedirRuta('/activa', null)).estado, 404);
    assert.equal((await e.pedirRuta('/historial', null)).estado, 404);
    assert.deepEqual(e.consultas, []);
    assert.equal(e.filas.size, 2);
  });
});
