import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it, type TestContext } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { HistorialCambiosPlan } from '../../../application/dto/historialCambios.dto.js';
import { ConsultarHistorialCambios } from '../../../application/use-cases/ConsultarHistorialCambios.js';
import type { ILectorEventosPlan } from '../../../domain/repositories/IEventosPlanDAO.js';
import type { IPropiedadExpedicion } from '../../../domain/repositories/IPropiedadExpedicion.js';
import { EventosPlanDAOMemoria } from '../../../infrastructure/repositories/memoria/EventosPlanDAOMemoria.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';
import { crearRutasHistorialCambios } from './rutasHistorialCambios.js';

const secreto = 'secreto-ficticio-exclusivo-pruebas-hu36';
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: secreto, SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia', MEDICAL_ENCRYPTION_KEY: 'clave-medica-ficticia-de-32-caracteres',
});
const actorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const expedicionA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const expedicionB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const expedicionSinCambios = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function token(actor = actorA, rol = 'senderista') {
  return jwt.sign({ sub: actor, rol }, secreto, { expiresIn: '1h' });
}

async function preparar(t: TestContext) {
  const dao = new EventosPlanDAOMemoria({ ahora: () => new Date('2026-11-01T09:00:00.000Z') });
  await dao.registrar({
    expedicionId: expedicionA, senderistaId: actorA, tipo: 'EDITADA', actorId: actorA, versionResultante: 2,
    cambios: { lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' } }, motivo: null,
    operacionId: '99999999-9999-4999-8999-000000000001',
  });
  await dao.registrar({
    expedicionId: expedicionB, senderistaId: actorB, tipo: 'CANCELADA', actorId: actorB, versionResultante: 2,
    cambios: { estado: { antes: 'programada', despues: 'cancelada' } }, motivo: 'motivo-privado-b',
    operacionId: '99999999-9999-4999-8999-000000000002',
  });
  const duenos = new Map([[expedicionA, actorA], [expedicionB, actorB], [expedicionSinCambios, actorA]]);
  const consultas: string[] = [];
  const propiedad: IPropiedadExpedicion = {
    async esPropietario(senderistaId, expedicionId) {
      consultas.push(`propiedad:${expedicionId}`);
      return duenos.get(expedicionId) === senderistaId;
    },
  };
  const lector: ILectorEventosPlan = {
    async listarPorExpedicion(senderistaId, expedicionId) {
      consultas.push(`eventos:${expedicionId}`);
      return dao.listarPorExpedicion(senderistaId, expedicionId);
    },
  };
  const app = express();
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/expediciones', crearRutasHistorialCambios(new ConsultarHistorialCambios(propiedad, lector)));
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
      cuerpo: await respuesta.json() as Partial<HistorialCambiosPlan> & { codigo?: string; mensaje?: string } };
  }
  const pedir = (id = expedicionA, credencial: string | null = token()) => pedirRuta(`/${id}/cambios`, credencial);
  return { pedir, pedirRuta, consultas, lector };
}

describe('API HU-36: GET /api/expediciones/:id/cambios con Express y JWT reales', () => {
  it('200: devuelve el historial propio sin datos internos y con no-store', async (t) => {
    const e = await preparar(t);
    const respuesta = await e.pedir();
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cache, 'no-store');
    assert.deepEqual(respuesta.cuerpo, {
      expedicionId: expedicionA,
      cambios: [{
        id: respuesta.cuerpo.cambios![0].id, tipo: 'EDITADA', ocurridoEn: '2026-11-01T09:00:00.000Z', version: 2,
        autor: { esPropietario: true }, motivo: null, anonimizado: false,
        cambios: [{ campo: 'lugarFin', antes: 'Laguna 69', despues: 'Nevado Ishinca' }],
      }],
    });
    assert.doesNotMatch(JSON.stringify(respuesta.cuerpo), /operacion|senderista|actorId|motivo-privado/);
  });

  it('200 con lista vacía para una expedición propia sin cambios', async (t) => {
    const e = await preparar(t);
    const respuesta = await e.pedir(expedicionSinCambios);
    assert.equal(respuesta.estado, 200);
    assert.deepEqual(respuesta.cuerpo, { expedicionId: expedicionSinCambios, cambios: [] });
  });

  it('404 igual para ajena e inexistente, sin consultar eventos', async (t) => {
    const e = await preparar(t);
    const ajena = await e.pedir(expedicionB);
    const inexistente = await e.pedir('ffffffff-ffff-4fff-8fff-ffffffffffff');
    assert.equal(ajena.estado, 404);
    assert.equal(inexistente.estado, 404);
    assert.equal(ajena.cache, 'no-store');
    assert.deepEqual(ajena.cuerpo, inexistente.cuerpo);
    assert.equal(ajena.cuerpo.codigo, 'EXPEDICION_NO_ENCONTRADA');
    assert.doesNotMatch(JSON.stringify(ajena.cuerpo), /motivo-privado|cancelada/);
    assert.equal(e.consultas.some((consulta) => consulta.startsWith('eventos:')), false);
  });

  it('401 sin sesión o con JWT inválido o expirado y 403 para rescatista, antes de consultar', async (t) => {
    const e = await preparar(t);
    const expirado = jwt.sign({ sub: actorA, rol: 'senderista' }, secreto, { expiresIn: -1 });
    for (const [credencial, estado, codigo] of [
      [null, 401, 'NO_AUTORIZADO'], ['alterado', 401, 'TOKEN_INVALIDO'], [expirado, 401, 'TOKEN_INVALIDO'],
      [token(actorA, 'rescatista'), 403, 'PROHIBIDO'],
    ] as const) {
      const respuesta = await e.pedir(expedicionA, credencial);
      assert.equal(respuesta.estado, estado);
      assert.equal(respuesta.cuerpo.codigo, codigo);
      assert.equal(respuesta.cache, 'no-store');
    }
    assert.deepEqual(e.consultas, []);
  });

  it('400 si el id no es un UUID, sin consultar', async (t) => {
    const e = await preparar(t);
    const respuesta = await e.pedir('no-es-un-uuid');
    assert.equal(respuesta.estado, 400);
    assert.deepEqual(e.consultas, []);
  });

  it('500 sin detalles internos si falla la lectura', async (t) => {
    const e = await preparar(t);
    e.lector.listarPorExpedicion = async () => {
      throw new ErrorAplicacion(500, 'No se pudo consultar el historial de cambios.', 'HISTORIAL_CAMBIOS_NO_DISPONIBLE');
    };
    const respuesta = await e.pedir();
    assert.equal(respuesta.estado, 500);
    assert.equal(respuesta.cuerpo.codigo, 'HISTORIAL_CAMBIOS_NO_DISPONIBLE');
    assert.equal(respuesta.cuerpo.cambios, undefined);
  });

  it('no acepta escrituras ni intercepta otras rutas de expediciones', async (t) => {
    const e = await preparar(t);
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await e.pedirRuta(`/${expedicionA}/cambios`, token(), metodo)).estado, 404);
    }
    assert.equal((await e.pedirRuta(`/${expedicionA}`, null)).estado, 404);
    assert.equal((await e.pedirRuta('/historial', null)).estado, 404);
    assert.deepEqual(e.consultas, []);
  });
});
