import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';

// Las rutas importan módulos que leen el entorno al cargarse; se fija antes de importarlas.
Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'secreto-ficticio-coordinacion-000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { crearRutasRescate } = await import('./rutasRescate.js');
const { AsignarResponsable } = await import('../../../application/use-cases/AsignarResponsable.js');
const { IncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SIN_PERFIL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // rol rescatista en el JWT, sin perfil validado
const SENDERISTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ALERTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';

const CLAVES_COORDINACION = ['asumidoEn', 'esMia', 'incidenteId', 'nombreResponsable', 'responsableId', 'version'];
const PATRON_MEDICO = /sangre|alergi|condicion|medicament|ficha|salud|consentimiento/i;

describe('POST /api/rescate/alertas/:expedicionId/coordinacion (HU-39)', () => {
  const alertas = new Map([[ALERTA, 'alerta']]);
  const dao = new IncidenteDAOMemoria(new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]), alertas);
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;

  const cabeceras = (sub: string, rol: 'senderista' | 'rescatista' = 'rescatista') => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${firmarToken({ sub, rol })}`,
  });
  const asumir = (sub: string, cuerpo: unknown, expedicion = ALERTA, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}/${expedicion}/coordinacion`, {
      method: 'POST',
      headers: cabeceras(sub, rol),
      body: JSON.stringify(cuerpo),
    });

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/rescate', crearRutasRescate({ asignarResponsable: new AsignarResponsable(dao) }));
    app.use(errorHandler);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate/alertas`;
  });

  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('sin token responde 401 (única respuesta 401 de la ruta)', async () => {
    const res = await fetch(`${base}/${ALERTA}/coordinacion`, { method: 'POST' });
    assert.equal(res.status, 401);
  });

  it('un senderista recibe 403 PROHIBIDO', async () => {
    const res = await asumir(SENDERISTA, { operacionId: randomUUID() }, ALERTA, 'senderista');
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'PROHIBIDO');
  });

  it('un rescatista sin perfil validado recibe 403 NO_ES_RESCATISTA', async () => {
    const res = await asumir(SIN_PERFIL, { operacionId: randomUUID() });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'NO_ES_RESCATISTA');
  });

  it('cuerpo sin operacionId, con una operación inválida o una alerta que no es UUID: 400', async () => {
    for (const cuerpo of [{}, { operacionId: 'no-es-uuid' }, { operacionId: 7 }]) {
      const res = await asumir(ANA, cuerpo);
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
    }
    assert.equal((await asumir(ANA, { operacionId: randomUUID() }, 'no-es-uuid')).status, 400);
  });

  it('una alerta inexistente recibe 404 ALERTA_NO_ENCONTRADA', async () => {
    const res = await asumir(ANA, { operacionId: randomUUID() }, INEXISTENTE);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'ALERTA_NO_ENCONTRADA');
  });

  it('CA-01/CA-02: 201 al asumir, 200 al repetir el mismo comando, 409 con el responsable vigente para otro rescatista', async () => {
    const operacion = randomUUID();

    const primera = await asumir(ANA, { operacionId: operacion });
    assert.equal(primera.status, 201);
    const cuerpo = (await primera.json()) as { coordinacion: Record<string, unknown> };
    assert.deepEqual(Object.keys(cuerpo), ['coordinacion']);
    assert.deepEqual(Object.keys(cuerpo.coordinacion).sort(), CLAVES_COORDINACION);
    assert.equal(cuerpo.coordinacion.responsableId, ANA);
    assert.equal(cuerpo.coordinacion.nombreResponsable, 'Ana Rescate');
    assert.equal(cuerpo.coordinacion.esMia, true);
    assert.equal(cuerpo.coordinacion.version, 1);

    const repetida = await asumir(ANA, { operacionId: operacion });
    assert.equal(repetida.status, 200);
    assert.deepEqual(await repetida.json(), cuerpo, 'la repetición devuelve el mismo resultado');

    const conflicto = await asumir(BETO, { operacionId: randomUUID() });
    assert.equal(conflicto.status, 409);
    const errorConflicto = (await conflicto.json()) as Record<string, unknown>;
    assert.equal(errorConflicto.codigo, 'COORDINACION_YA_ASUMIDA');
    assert.deepEqual(errorConflicto.responsableVigente, { responsableId: ANA, nombreResponsable: 'Ana Rescate' });

    assert.equal(dao.filas.filter((f) => f.incidente.expedicionId === ALERTA).length, 1);
  });

  it('el mismo actor que ya coordina, con otro operacionId, recibe 200 y no se crea nada', async () => {
    const alertaPropia = randomUUID();
    alertas.set(alertaPropia, 'alerta');
    const creada = await asumir(ANA, { operacionId: randomUUID() }, alertaPropia);
    assert.equal(creada.status, 201);
    const { coordinacion } = (await creada.json()) as { coordinacion: { incidenteId: string } };
    const registrosAntes = dao.filas.length;
    const operacionNueva = randomUUID();

    const repetida = await asumir(ANA, { operacionId: operacionNueva }, alertaPropia);

    assert.equal(repetida.status, 200, 'no se creó nada: no es 201');
    const cuerpo = (await repetida.json()) as { coordinacion: { incidenteId: string; esMia: boolean } };
    assert.equal(cuerpo.coordinacion.incidenteId, coordinacion.incidenteId, 'devuelve el incidente vigente');
    assert.equal(cuerpo.coordinacion.esMia, true);
    assert.equal(dao.filas.length, registrosAntes, 'no se agregó ningún registro');
    assert.equal(
      dao.filas.some((f) => f.operacionId === operacionNueva),
      false,
      'la operación nueva no queda registrada',
    );
  });

  it('una operación de otro rescatista recibe 404 y una usada en otro tipo de operación, 400', async () => {
    // Alerta propia: la operación queda registrada solo cuando se crea el incidente.
    const otraAlerta = randomUUID();
    alertas.set(otraAlerta, 'alerta');
    const operacion = randomUUID();
    assert.equal((await asumir(ANA, { operacionId: operacion }, otraAlerta)).status, 201);
    assert.equal((await asumir(BETO, { operacionId: operacion }, otraAlerta)).status, 404);
    assert.equal((await asumir(ANA, { operacionId: operacion }, ALERTA)).status, 404, 'misma operación en otra alerta');

    const ajena = randomUUID();
    dao.operacionesDeOtroTipo.add(ajena);
    const res = await asumir(ANA, { operacionId: ajena });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'DATOS_INVALIDOS');
  });

  it('ni las respuestas de éxito ni las de error traen datos médicos y ninguna de negocio es 401', async () => {
    const respuestas = [
      await asumir(ANA, { operacionId: randomUUID() }),
      await asumir(BETO, { operacionId: randomUUID() }),
      await asumir(SIN_PERFIL, { operacionId: randomUUID() }),
      await asumir(ANA, { operacionId: randomUUID() }, INEXISTENTE),
      await asumir(ANA, {}),
    ];
    for (const res of respuestas) {
      assert.notEqual(res.status, 401);
      assert.ok(!PATRON_MEDICO.test(await res.text()));
    }
  });
});
