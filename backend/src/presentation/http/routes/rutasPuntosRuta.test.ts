import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crearRutasPuntosRuta } from './rutasPuntosRuta.js';
import { ServicioPuntosRuta } from '../../../application/services/servicioPuntosRuta.js';
import { RepositorioPuntosRutaMemoria } from '../../../testing/puntosRuta/RepositorioPuntosRutaMemoria.js';
import { ahoraFixture, puntoFixture, rutaFixture, senderistaFixture as actor, otroSenderistaFixture as otro } from '../../../testing/puntosRuta/fixtures.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';
import { firmarToken } from '../../../infrastructure/security/jwt.js';
import type { IConsultaPuntosRuta, IGuardadoPuntosRuta } from '../../../application/ports/puntosRuta.js';
import type { RutaConPuntos } from '../../../domain/entities/RutaConPuntos.js';

const leerRuta = (response: globalThis.Response) => response.json() as Promise<RutaConPuntos & { mensaje?: string }>;
const leerError = (response: globalThis.Response) => response.json() as Promise<{
  codigo: string; detalles: Record<string, string[]>;
}>;

// Valores ficticios locales, antes del primer loadEnv(). No arranca main/cron.
Object.assign(process.env, {
  NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'fixture-no-utilizado',
  JWT_SECRET: 'secreto-ficticio-de-pruebas-hu32-0000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-pruebas-0000000000',
});

describe('HTTP de puntos con JWT y servicio reales', () => {
  let server: Server;
  let base: string;
  let ruta: ReturnType<typeof rutaFixture>;
  let repo: RepositorioPuntosRutaMemoria;
  let consulta: IConsultaPuntosRuta;
  let guardado: IGuardadoPuntosRuta;
  let token: string;

  beforeEach(async () => {
    ruta = rutaFixture();
    repo = new RepositorioPuntosRutaMemoria(ahoraFixture);
    repo.preparar(actor, ruta);
    consulta = repo;
    guardado = repo;
    // Delegacion para poder inyectar fallos tecnicos sin abrir servicios reales.
    const servicio = new ServicioPuntosRuta({ consultarPropia: (...args) => consulta.consultarPropia(...args) }, {
      guardarColeccionPropia: (orden) => guardado.guardarColeccionPropia(orden),
    });
    const app = express();
    app.use(express.json({ limit: '100kb' }));
    app.use('/api/expediciones', crearRutasPuntosRuta(servicio));
    app.use(notFoundHandler);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/expediciones`;
    token = firmarToken({ sub: actor, rol: 'senderista' });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  const put = (body: unknown, auth = token, id = ruta.expedicion.id) => fetch(`${base}/${id}/puntos`, {
    method: 'PUT', headers: headers(auth), body: JSON.stringify(body),
  });

  it('GET y PUT integran consulta, guardado, orden, version e IDs estables', async () => {
    const initial = await fetch(`${base}/${ruta.expedicion.id}/puntos`, { headers: headers(token) });
    assert.equal(initial.status, 200);
    assert.equal(initial.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await initial.json(), ruta);
    const points = [puntoFixture(2), puntoFixture(1)];
    const response = await put({ versionEsperada: 1, puntos: points });
    assert.equal(response.status, 200);
    const saved = await leerRuta(response);
    assert.equal(saved.mensaje, 'Puntos de ruta guardados');
    assert.equal(saved.expedicion.version, 2);
    assert.deepEqual(saved.puntos.map((p: { id: string }) => p.id), [points[1].id, points[0].id]);
    const read = await fetch(`${base}/${ruta.expedicion.id}/puntos`, { headers: headers(token) });
    assert.deepEqual((await leerRuta(read)).puntos, saved.puntos);
  });
  it('rechaza JWT ausente, invalido y rol rescatista antes del servicio', async () => {
    consulta = { consultarPropia: async () => { throw new Error('No debe llamarse'); } };
    const url = `${base}/${ruta.expedicion.id}/puntos`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: headers('invalido') })).status, 401);
    const rescue = firmarToken({ sub: otro, rol: 'rescatista' });
    assert.equal((await fetch(url, { headers: headers(rescue) })).status, 403);
    assert.equal((await put({ versionEsperada: 1, puntos: [] }, rescue)).status, 403);
  });
  it('un plan ajeno responde 404 y el cuerpo no puede elegir al propietario', async () => {
    const foreignToken = firmarToken({ sub: otro, rol: 'senderista' });
    assert.equal((await fetch(`${base}/${ruta.expedicion.id}/puntos`, { headers: headers(foreignToken) })).status, 404);
    assert.equal((await put({ versionEsperada: 1, puntos: [] }, foreignToken)).status, 404);
    const forged = await put({ versionEsperada: 1, puntos: [], senderistaId: otro });
    assert.equal(forged.status, 400);
    assert.ok((await leerError(forged)).detalles.senderistaId);
    assert.deepEqual(await repo.consultarPropia(actor, ruta.expedicion.id), ruta);
  });
  it('errores de entrada conservan rutas por campo e indices originales', async () => {
    const response = await put({ versionEsperada: 1, puntos: [puntoFixture(2, { nombre: ' ' }), puntoFixture(2)] });
    assert.equal(response.status, 400);
    const error = await leerError(response);
    assert.equal(error.codigo, 'DATOS_PUNTOS_INVALIDOS');
    assert.ok(error.detalles['puntos.0.nombre']);
    assert.ok(error.detalles['puntos.1.orden']);
    assert.deepEqual(await repo.consultarPropia(actor, ruta.expedicion.id), ruta);
  });
  it('distingue ID de parametro invalido y cuerpo raiz invalido', async () => {
    const invalidId = await put({ versionEsperada: 1, puntos: [] }, token, 'invalido');
    assert.equal(invalidId.status, 400);
    assert.ok((await leerError(invalidId)).detalles.id);
    const invalidBody = await put([]);
    assert.equal(invalidBody.status, 400);
    assert.ok((await leerError(invalidBody)).detalles._cuerpo);
  });
  it('rechaza exceso de puntos, version insegura y datos medicos/estado adicionales', async () => {
    for (const body of [
      { versionEsperada: 1, puntos: Array.from({ length: 21 }, (_, i) => puntoFixture(i + 1)) },
      { versionEsperada: Number.MAX_SAFE_INTEGER + 1, puntos: [] },
      { versionEsperada: 1, puntos: [], estado: 'completada', fichaMedica: {} },
    ]) {
      const response = await put(body);
      assert.equal(response.status, 400);
      assert.equal((await leerError(response)).codigo, 'DATOS_PUNTOS_INVALIDOS');
    }
  });
  it('conflicto de version devuelve 409 y conserva la coleccion guardada', async () => {
    const puntos = [puntoFixture()];
    assert.equal((await put({ versionEsperada: 1, puntos })).status, 200);
    const stale = await put({ versionEsperada: 1, puntos: [] });
    assert.equal(stale.status, 409);
    assert.equal((await leerError(stale)).codigo, 'VERSION_PLAN_OBSOLETA');
    assert.deepEqual((await repo.consultarPropia(actor, ruta.expedicion.id))!.puntos, puntos);
  });
  it('estado y salida alcanzada se traducen a conflictos distintos', async () => {
    repo.cambiarContexto(ruta.expedicion.id, { estado: 'en_progreso' });
    const state = await put({ versionEsperada: 1, puntos: [] });
    assert.equal(state.status, 409);
    assert.equal((await leerError(state)).codigo, 'EXPEDICION_NO_EDITABLE');
    repo.cambiarContexto(ruta.expedicion.id, { estado: 'programada', horaInicio: '2000-01-01T00:00:00.000Z' });
    const expired = await put({ versionEsperada: 1, puntos: [] });
    assert.equal(expired.status, 409);
    assert.equal((await leerError(expired)).codigo, 'EXPEDICION_YA_INICIADA');
  });
  it('el rechazo de SQL conserva errores por campo', async () => {
    guardado = { guardarColeccionPropia: async () => ({ tipo: 'datos_invalidos', detalles: { 'puntos.0.id': ['No disponible'] } }) };
    const response = await put({ versionEsperada: 1, puntos: [puntoFixture()] });
    assert.equal(response.status, 400);
    assert.deepEqual((await leerError(response)).detalles, { 'puntos.0.id': ['No disponible'] });
  });
  it('un fallo tecnico devuelve 500 sin detalles SQL en la respuesta', async (ctx) => {
    ctx.mock.method(console, 'error', () => {});
    guardado = { guardarColeccionPropia: async () => { throw new Error('DETALLE_SQL_FICTICIO'); } };
    const response = await put({ versionEsperada: 1, puntos: [puntoFixture()] });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'ErrorInternoServidor', mensaje: 'Error interno del servidor' });
  });
});
