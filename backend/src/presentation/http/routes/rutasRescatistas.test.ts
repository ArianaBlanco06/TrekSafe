import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'secreto-ficticio-rescatistas-00000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { crearRutasRescate } = await import('./rutasRescate.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');
type IRescatistasDAO = import('../../../domain/repositories/IRescatistasDAO.js').IRescatistasDAO;

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SENDERISTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('GET /api/rescate/rescatistas (HU-40)', () => {
  const consultas: string[] = [];
  const dao: IRescatistasDAO = {
    listarElegibles: async (excluirId) => {
      consultas.push(excluirId);
      return [
        { id: ANA, nombreCompleto: 'Ana Rescate' },
        { id: BETO, nombreCompleto: 'Beto Rescate' },
        { id: CARLA, nombreCompleto: 'Carla Rescate' },
      ].filter((r) => r.id !== excluirId);
    },
  };
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;
  const pedir = (sub: string, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}/rescatistas`, { headers: { Authorization: `Bearer ${firmarToken({ sub, rol })}` } });

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/rescate',
      crearRutasRescate({
        asignarResponsable: {} as never,
        proponerRelevo: {} as never,
        aceptarRelevo: {} as never,
        rescatistas: dao,
      }),
    );
    app.use(errorHandler);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate`;
  });

  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('sin token, 401', async () => {
    assert.equal((await fetch(`${base}/rescatistas`)).status, 401);
  });

  it('un senderista recibe 403 PROHIBIDO', async () => {
    const res = await pedir(SENDERISTA, 'senderista');
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'PROHIBIDO');
  });

  it('un rescatista recibe 200 con los demás rescatistas, sin él mismo', async () => {
    const res = await pedir(ANA);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      rescatistas: [
        { id: BETO, nombreCompleto: 'Beto Rescate' },
        { id: CARLA, nombreCompleto: 'Carla Rescate' },
      ],
    });
  });

  it('el actor sale del JWT y la respuesta solo tiene id y nombreCompleto, sin datos médicos', async () => {
    consultas.length = 0;
    const cuerpo = (await (await pedir(BETO)).json()) as { rescatistas: Record<string, unknown>[] };
    assert.deepEqual(consultas, [BETO]);
    for (const r of cuerpo.rescatistas) assert.deepEqual(Object.keys(r).sort(), ['id', 'nombreCompleto']);
    assert.doesNotMatch(JSON.stringify(cuerpo), /sangre|alergi|condicion|medicament|ficha|salud|credencial|correo/i);
  });
});
