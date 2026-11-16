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
  JWT_SECRET: 'secreto-ficticio-bitacora-incidente-00',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { crearRutasRescate } = await import('./rutasRescate.js');
const { AgregarEntradaBitacora } = await import('../../../application/use-cases/AgregarEntradaBitacora.js');
const { ConsultarBitacoraIncidente } = await import('../../../application/use-cases/ConsultarBitacoraIncidente.js');
const { BitacoraIncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/BitacoraIncidenteDAOMemoria.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SENDERISTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EXPEDICION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';

const CLAVES_ENTRADA = ['autor', 'corrigeEntradaId', 'id', 'registradaEn', 'texto', 'tipo'];
const CLAVES_BITACORA = ['entradas', 'esResponsable', 'estado', 'expedicionId', 'incidenteId', 'puedeEscribir', 'responsable'];
// Las fixtures de este archivo no deben contener ninguna de estas palabras.
const PATRON_MEDICO = /sangre|alergi|condicion|medicament|ficha|salud|consentimiento/i;

describe('Bitácora del incidente: /api/rescate/incidentes/:incidenteId/bitacora (HU-41)', () => {
  const dao = new BitacoraIncidenteDAOMemoria(new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]));
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;

  const nuevoIncidente = (responsableId = ANA): string => {
    const id = randomUUID();
    dao.sembrarIncidente({ id, expedicionId: EXPEDICION, responsableId });
    return id;
  };
  const cabeceras = (sub: string, rol: 'senderista' | 'rescatista' = 'rescatista') => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${firmarToken({ sub, rol })}`,
  });
  const leer = (sub: string, incidente: string, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}/${incidente}/bitacora`, { headers: cabeceras(sub, rol) });
  const escribir = (sub: string, incidente: string, cuerpo: unknown, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}/${incidente}/bitacora`, { method: 'POST', headers: cabeceras(sub, rol), body: JSON.stringify(cuerpo) });

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/rescate', crearRutasRescate({
      consultarBitacoraIncidente: new ConsultarBitacoraIncidente(dao),
      agregarEntradaBitacora: new AgregarEntradaBitacora(dao),
    }));
    app.use(errorHandler);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate/incidentes`;
  });

  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('GET y POST sin token responden 401 (única respuesta 401 de la ruta)', async () => {
    const incidente = nuevoIncidente();
    assert.equal((await fetch(`${base}/${incidente}/bitacora`)).status, 401);
    assert.equal((await fetch(`${base}/${incidente}/bitacora`, { method: 'POST' })).status, 401);
  });

  it('un senderista recibe 403 PROHIBIDO en GET y en POST', async () => {
    const incidente = nuevoIncidente();
    for (const res of [
      await leer(SENDERISTA, incidente, 'senderista'),
      await escribir(SENDERISTA, incidente, { operacionId: randomUUID(), texto: 'x' }, 'senderista'),
    ]) {
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as { codigo: string }).codigo, 'PROHIBIDO');
    }
  });

  it('un incidenteId que no es UUID da 400 ErrorValidacion', async () => {
    for (const res of [await leer(ANA, 'no-es-uuid'), await escribir(ANA, 'no-es-uuid', { operacionId: randomUUID(), texto: 'x' })]) {
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
    }
  });

  it('cuerpos inválidos dan 400 ErrorValidacion: vacío, texto vacío, 2001 caracteres, tipo y autorId', async () => {
    const incidente = nuevoIncidente();
    const operacionId = randomUUID();
    const cuerpos: unknown[] = [
      {},
      { operacionId },
      { operacionId, texto: '   ' },
      { operacionId, texto: 'a'.repeat(2001) },
      { operacionId, texto: 'x', tipo: 'cierre' },
      { operacionId, texto: 'x', autorId: BETO },
      { operacionId: 'no-es-uuid', texto: 'x' },
    ];
    for (const cuerpo of cuerpos) {
      const res = await escribir(ANA, incidente, cuerpo);
      assert.equal(res.status, 400, JSON.stringify(cuerpo));
      assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
    }
    assert.deepEqual((await dao.listar(incidente))?.entradas, []);
  });

  it('GET de un incidente inexistente da 404 INCIDENTE_NO_ENCONTRADO', async () => {
    const res = await leer(ANA, INEXISTENTE);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'INCIDENTE_NO_ENCONTRADO');
    const post = await escribir(ANA, INEXISTENTE, { operacionId: randomUUID(), texto: 'x' });
    assert.equal(post.status, 404);
  });

  it('CA-01: el responsable recibe 201 con las claves exactas y la repetición da 200 con el cuerpo idéntico', async () => {
    const incidente = nuevoIncidente();
    const operacionId = randomUUID();

    const primera = await escribir(ANA, incidente, { operacionId, texto: '  Llegamos al punto de encuentro  ' });
    assert.equal(primera.status, 201);
    const cuerpo = (await primera.json()) as { entrada: Record<string, unknown> };
    assert.deepEqual(Object.keys(cuerpo), ['entrada']);
    assert.deepEqual(Object.keys(cuerpo.entrada).sort(), CLAVES_ENTRADA);
    assert.equal(cuerpo.entrada.texto, 'Llegamos al punto de encuentro');
    assert.equal(cuerpo.entrada.tipo, 'nota');
    assert.equal(cuerpo.entrada.corrigeEntradaId, null);
    assert.deepEqual(cuerpo.entrada.autor, { autorId: ANA, nombreAutor: 'Ana Rescate', esMia: true });
    assert.ok(!Number.isNaN(Date.parse(String(cuerpo.entrada.registradaEn))));

    const repetida = await escribir(ANA, incidente, { operacionId, texto: 'Llegamos al punto de encuentro' });
    assert.equal(repetida.status, 200);
    assert.deepEqual(await repetida.json(), cuerpo);
    assert.equal((await dao.listar(incidente))?.entradas.length, 1);
  });

  it('CA-03: otro rescatista lee todo con puedeEscribir=false, en el orden del servidor, y recibe 403 al escribir', async () => {
    const incidente = nuevoIncidente();
    for (const texto of ['Primera', 'Segunda', 'Tercera']) {
      assert.equal((await escribir(ANA, incidente, { operacionId: randomUUID(), texto })).status, 201);
    }

    const res = await leer(BETO, incidente);
    assert.equal(res.status, 200);
    const { bitacora } = (await res.json()) as { bitacora: Record<string, unknown> & { entradas: { texto: string; autor: { esMia: boolean } }[] } };
    assert.deepEqual(Object.keys(bitacora).sort(), CLAVES_BITACORA);
    assert.equal(bitacora.puedeEscribir, false);
    assert.equal(bitacora.esResponsable, false);
    assert.equal(bitacora.estado, 'abierto');
    assert.deepEqual(bitacora.responsable, { responsableId: ANA, nombreResponsable: 'Ana Rescate' });
    assert.deepEqual(bitacora.entradas.map((e) => e.texto), ['Primera', 'Segunda', 'Tercera']);
    assert.deepEqual(bitacora.entradas.map((e) => e.autor.esMia), [false, false, false]);

    const rechazo = await escribir(BETO, incidente, { operacionId: randomUUID(), texto: 'No me toca' });
    assert.equal(rechazo.status, 403);
    const error = (await rechazo.json()) as Record<string, unknown>;
    assert.equal(error.codigo, 'NO_ES_RESPONSABLE');
    assert.deepEqual(error.responsableVigente, { responsableId: ANA, nombreResponsable: 'Ana Rescate' });

    const comoAna = (await (await leer(ANA, incidente)).json()) as { bitacora: { puedeEscribir: boolean; entradas: { autor: { esMia: boolean } }[] } };
    assert.equal(comoAna.bitacora.puedeEscribir, true);
    assert.equal(comoAna.bitacora.entradas.every((e) => e.autor.esMia), true);
  });

  it('una corrección da 201 con tipo correccion y la entrada original queda sin cambios', async () => {
    const incidente = nuevoIncidente();
    const original = (await (await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Dato equivocado' })).json()) as { entrada: { id: string } };
    const res = await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Dato corregido', corrigeEntradaId: original.entrada.id });
    assert.equal(res.status, 201);
    const { entrada } = (await res.json()) as { entrada: { tipo: string; corrigeEntradaId: string } };
    assert.equal(entrada.tipo, 'correccion');
    assert.equal(entrada.corrigeEntradaId, original.entrada.id);

    const { bitacora } = (await (await leer(ANA, incidente)).json()) as { bitacora: { entradas: { id: string; texto: string }[] } };
    assert.deepEqual(bitacora.entradas.map((e) => e.texto), ['Dato equivocado', 'Dato corregido']);

    const ajena = await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Cruzada', corrigeEntradaId: INEXISTENTE });
    assert.equal(ajena.status, 400);
    assert.equal(((await ajena.json()) as { codigo: string }).codigo, 'CORRECCION_INVALIDA');
  });

  it('tras el relevo, ANA recibe 403 y BETO 201', async () => {
    const incidente = nuevoIncidente();
    assert.equal((await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Antes del relevo' })).status, 201);
    dao.relevar(incidente, BETO);
    const deAna = await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Después del relevo' });
    assert.equal(deAna.status, 403);
    assert.deepEqual(((await deAna.json()) as { responsableVigente: unknown }).responsableVigente, { responsableId: BETO, nombreResponsable: 'Beto Rescate' });
    assert.equal((await escribir(BETO, incidente, { operacionId: randomUUID(), texto: 'Yo coordino' })).status, 201);
    const { bitacora } = (await (await leer(BETO, incidente)).json()) as { bitacora: { puedeEscribir: boolean; entradas: { autor: { nombreAutor: string } }[] } };
    assert.equal(bitacora.puedeEscribir, true);
    assert.deepEqual(bitacora.entradas.map((e) => e.autor.nombreAutor), ['Ana Rescate', 'Beto Rescate']);
  });

  it('con el incidente cerrado, POST da 409 INCIDENTE_CERRADO y GET sigue dando 200 con todas las entradas', async () => {
    const incidente = nuevoIncidente();
    assert.equal((await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Antes del cierre' })).status, 201);
    dao.cambiarEstado(incidente, 'cerrado');
    const post = await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Tarde' });
    assert.equal(post.status, 409);
    assert.equal(((await post.json()) as { codigo: string }).codigo, 'INCIDENTE_CERRADO');
    const get = await leer(BETO, incidente);
    assert.equal(get.status, 200);
    const { bitacora } = (await get.json()) as { bitacora: { estado: string; puedeEscribir: boolean; entradas: unknown[] } };
    assert.equal(bitacora.estado, 'cerrado');
    assert.equal(bitacora.puedeEscribir, false);
    assert.equal(bitacora.entradas.length, 1);
  });

  it('el mismo operacionId con otro texto da 409 OPERACION_YA_REGISTRADA', async () => {
    const incidente = nuevoIncidente();
    const operacionId = randomUUID();
    assert.equal((await escribir(ANA, incidente, { operacionId, texto: 'Original' })).status, 201);
    const res = await escribir(ANA, incidente, { operacionId, texto: 'Distinto' });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'OPERACION_YA_REGISTRADA');
  });

  it('un operacionId usado en otro tipo de operación da 409 OPERACION_YA_REGISTRADA sin revelar nada', async () => {
    const incidente = nuevoIncidente();
    const ajena = randomUUID();
    dao.operacionesDeOtroTipo.add(ajena);
    const res = await escribir(ANA, incidente, { operacionId: ajena, texto: 'x' });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'OPERACION_YA_REGISTRADA');
  });

  it('ninguna respuesta de negocio es 401 y ninguna trae datos médicos', async () => {
    const incidente = nuevoIncidente();
    const respuestas = [
      await escribir(ANA, incidente, { operacionId: randomUUID(), texto: 'Nota operativa' }),
      await escribir(BETO, incidente, { operacionId: randomUUID(), texto: 'Nota de otro' }),
      await escribir(ANA, incidente, {}),
      await escribir(ANA, INEXISTENTE, { operacionId: randomUUID(), texto: 'x' }),
      await leer(ANA, incidente),
      await leer(ANA, INEXISTENTE),
    ];
    for (const res of respuestas) {
      assert.notEqual(res.status, 401);
      assert.ok(!PATRON_MEDICO.test(await res.text()));
    }
  });
});
