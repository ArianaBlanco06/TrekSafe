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
  JWT_SECRET: 'secreto-ficticio-cierre-incidente-0000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { crearRutasRescate } = await import('./rutasRescate.js');
const { AgregarEntradaBitacora } = await import('../../../application/use-cases/AgregarEntradaBitacora.js');
const { CerrarIncidente } = await import('../../../application/use-cases/CerrarIncidente.js');
const { ConsultarBitacoraIncidente } = await import('../../../application/use-cases/ConsultarBitacoraIncidente.js');
const { ConsultarCierreIncidente } = await import('../../../application/use-cases/ConsultarCierreIncidente.js');
const { MarcarIncidenteLocalizado } = await import('../../../application/use-cases/MarcarIncidenteLocalizado.js');
const { BitacoraIncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/BitacoraIncidenteDAOMemoria.js');
const { CierreIncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/CierreIncidenteDAOMemoria.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SENDERISTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';

const CLAVES_CIERRE = [
  'cerradoEn', 'cerradoPor', 'entradaBitacoraId', 'estadoExpedicion', 'expedicionId', 'id', 'incidenteId',
  'resultado', 'resumen', 'retornoConfirmadoPorSenderista', 'tipoCierre',
];
// Las fixtures de este archivo no deben contener ninguna de estas palabras.
const PATRON_MEDICO = /sangre|alergi|condicion|medicament|ficha|salud|consentimiento/i;

describe('Cierre del incidente con informe: /api/rescate (HU-42)', () => {
  const rescatistas = new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate']]);
  const bitacora = new BitacoraIncidenteDAOMemoria(rescatistas);
  const cierre = new CierreIncidenteDAOMemoria(bitacora, rescatistas);
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;

  const nuevoIncidente = (estado: 'abierto' | 'localizado' = 'localizado', responsableId = ANA) => {
    const id = randomUUID();
    const expedicionId = randomUUID();
    bitacora.sembrarIncidente({ id, expedicionId, responsableId, estado });
    cierre.sembrarExpedicion(expedicionId, 'alerta');
    return { id, expedicionId };
  };
  const cabeceras = (sub: string, rol: 'senderista' | 'rescatista' = 'rescatista') => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${firmarToken({ sub, rol })}`,
  });
  const post = (sub: string, ruta: string, cuerpo: unknown, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}${ruta}`, { method: 'POST', headers: cabeceras(sub, rol), body: JSON.stringify(cuerpo) });
  const get = (sub: string, ruta: string, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}${ruta}`, { headers: cabeceras(sub, rol) });
  const cuerpoCierre = (extra: Record<string, unknown> = {}) => ({
    comandoId: randomUUID(), resultado: 'evacuado', resumen: 'Evacuada al refugio sin novedad', ...extra,
  });

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/rescate', crearRutasRescate({
      consultarBitacoraIncidente: new ConsultarBitacoraIncidente(bitacora),
      agregarEntradaBitacora: new AgregarEntradaBitacora(bitacora),
      cerrarIncidente: new CerrarIncidente(cierre),
      marcarIncidenteLocalizado: new MarcarIncidenteLocalizado(cierre),
      consultarCierreIncidente: new ConsultarCierreIncidente(cierre),
    }));
    app.use(errorHandler);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate`;
  });

  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('sin token las tres rutas responden 401 (única respuesta 401 de la ruta)', async () => {
    const { id, expedicionId } = nuevoIncidente();
    assert.equal((await fetch(`${base}/incidentes/${id}/localizacion`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/incidentes/${id}/cierre`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/alertas/${expedicionId}/cierre`)).status, 401);
  });

  it('un senderista recibe 403 PROHIBIDO en las tres rutas', async () => {
    const { id, expedicionId } = nuevoIncidente();
    for (const res of [
      await post(SENDERISTA, `/incidentes/${id}/localizacion`, { operacionId: randomUUID() }, 'senderista'),
      await post(SENDERISTA, `/incidentes/${id}/cierre`, cuerpoCierre(), 'senderista'),
      await get(SENDERISTA, `/alertas/${expedicionId}/cierre`, 'senderista'),
    ]) {
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as { codigo: string }).codigo, 'PROHIBIDO');
    }
  });

  it('ids que no son UUID dan 400 ErrorValidacion', async () => {
    for (const res of [
      await post(ANA, '/incidentes/no-es-uuid/localizacion', { operacionId: randomUUID() }),
      await post(ANA, '/incidentes/no-es-uuid/cierre', cuerpoCierre()),
      await get(ANA, '/alertas/no-es-uuid/cierre'),
    ]) {
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
    }
  });

  it('CA-1: cuerpos de cierre inválidos dan 400 ErrorValidacion y no escriben nada (incluidas claves extra que intentan confirmar el retorno)', async () => {
    const { id } = nuevoIncidente();
    const cuerpos: unknown[] = [
      {},
      { comandoId: randomUUID(), resultado: 'evacuado' },
      { comandoId: randomUUID(), resumen: 'x' },
      cuerpoCierre({ resultado: 'fallecido' }),
      cuerpoCierre({ resultado: '' }),
      cuerpoCierre({ resumen: '' }),
      cuerpoCierre({ resumen: '   ' }),
      cuerpoCierre({ resumen: 'a'.repeat(2001) }),
      cuerpoCierre({ comandoId: 'no-es-uuid' }),
      cuerpoCierre({ rescatistaId: BETO }),
      cuerpoCierre({ estadoExpedicion: 'completada' }),
      cuerpoCierre({ confirmarRetorno: true }),
    ];
    for (const cuerpo of cuerpos) {
      const res = await post(ANA, `/incidentes/${id}/cierre`, cuerpo);
      assert.equal(res.status, 400, JSON.stringify(cuerpo));
      assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
    }
    assert.equal((await bitacora.listar(id))?.incidente.estado, 'localizado');
    assert.equal((await bitacora.listar(id))?.entradas.length, 0);
  });

  it('cuerpos de localización inválidos dan 400 ErrorValidacion', async () => {
    const { id } = nuevoIncidente('abierto');
    for (const cuerpo of [{}, { operacionId: 'no-es-uuid' }, { operacionId: randomUUID(), estado: 'cerrado' }]) {
      const res = await post(ANA, `/incidentes/${id}/localizacion`, cuerpo);
      assert.equal(res.status, 400, JSON.stringify(cuerpo));
      assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
    }
  });

  it('CA-1: un incidente inexistente da 404 INCIDENTE_NO_ENCONTRADO', async () => {
    for (const res of [
      await post(ANA, `/incidentes/${INEXISTENTE}/cierre`, cuerpoCierre()),
      await post(ANA, `/incidentes/${INEXISTENTE}/localizacion`, { operacionId: randomUUID() }),
    ]) {
      assert.equal(res.status, 404);
      assert.equal(((await res.json()) as { codigo: string }).codigo, 'INCIDENTE_NO_ENCONTRADO');
    }
  });

  it('CA-1: un no responsable recibe 403 NO_ES_RESPONSABLE con responsableVigente y no se escribe nada', async () => {
    const { id } = nuevoIncidente();
    for (const res of [
      await post(BETO, `/incidentes/${id}/cierre`, cuerpoCierre()),
      await post(BETO, `/incidentes/${id}/localizacion`, { operacionId: randomUUID() }),
    ]) {
      assert.equal(res.status, 403);
      const cuerpo = (await res.json()) as { codigo: string; responsableVigente: { responsableId: string; nombreResponsable: string } };
      assert.equal(cuerpo.codigo, 'NO_ES_RESPONSABLE');
      assert.deepEqual(cuerpo.responsableVigente, { responsableId: ANA, nombreResponsable: 'Ana Rescate' });
    }
    assert.equal((await bitacora.listar(id))?.incidente.estado, 'localizado');
  });

  it('CA-1: cerrar un incidente abierto da 409 INCIDENTE_NO_LOCALIZADO', async () => {
    const { id } = nuevoIncidente('abierto');
    const res = await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre());
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { codigo: string }).codigo, 'INCIDENTE_NO_LOCALIZADO');
    assert.equal((await bitacora.listar(id))?.incidente.estado, 'abierto');
  });

  it('marcar localizado: 200 con el estado, la repetición da 200 con repetido=true y la bitácora recibe la nota fija', async () => {
    const { id } = nuevoIncidente('abierto');
    const operacionId = randomUUID();
    const primera = await post(ANA, `/incidentes/${id}/localizacion`, { operacionId });
    assert.equal(primera.status, 200);
    const cuerpo = (await primera.json()) as { incidente: Record<string, unknown>; repetido: boolean };
    assert.deepEqual(Object.keys(cuerpo).sort(), ['incidente', 'repetido']);
    assert.deepEqual(Object.keys(cuerpo.incidente).sort(), ['estado', 'expedicionId', 'incidenteId', 'responsable', 'version']);
    assert.equal(cuerpo.incidente.estado, 'localizado');
    assert.equal(cuerpo.repetido, false);

    const repetida = await post(ANA, `/incidentes/${id}/localizacion`, { operacionId });
    assert.equal(repetida.status, 200);
    assert.equal(((await repetida.json()) as { repetido: boolean }).repetido, true);
    assert.equal((await bitacora.listar(id))?.entradas.length, 1);
  });

  it('CA-1 y CA-3: cierre feliz 201 con las claves exactas, tipoCierre operativo y la expedición sigue en alerta; la repetición da 200 con cuerpo idéntico', async () => {
    const { id, expedicionId } = nuevoIncidente();
    const cuerpo = cuerpoCierre({ resultado: 'asistido_en_terreno', resumen: '  Atendida y trasladada  ' });
    const primera = await post(ANA, `/incidentes/${id}/cierre`, cuerpo);
    assert.equal(primera.status, 201);
    const texto = await primera.text();
    const json = JSON.parse(texto) as { cierre: Record<string, unknown> };
    assert.deepEqual(Object.keys(json), ['cierre']);
    assert.deepEqual(Object.keys(json.cierre).sort(), CLAVES_CIERRE);
    assert.equal(json.cierre.resultado, 'asistido_en_terreno');
    assert.equal(json.cierre.resumen, 'Atendida y trasladada');
    assert.equal(json.cierre.tipoCierre, 'operativo');
    assert.equal(json.cierre.estadoExpedicion, 'alerta');
    assert.equal(json.cierre.retornoConfirmadoPorSenderista, false);
    assert.deepEqual(json.cierre.cerradoPor, { rescatistaId: ANA, nombreRescatista: 'Ana Rescate', esMio: true });
    assert.equal(cierre.estadoExpedicion(expedicionId), 'alerta');
    assert.ok(!PATRON_MEDICO.test(texto));

    const repetida = await post(ANA, `/incidentes/${id}/cierre`, cuerpo);
    assert.equal(repetida.status, 200);
    assert.equal(await repetida.text(), texto);
  });

  it('CA-2: otro comando sobre el cerrado da 409 INCIDENTE_CERRADO y el mismo comando con otros datos, 409 OPERACION_YA_REGISTRADA', async () => {
    const { id } = nuevoIncidente();
    const cuerpo = cuerpoCierre();
    assert.equal((await post(ANA, `/incidentes/${id}/cierre`, cuerpo)).status, 201);
    const otro = await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre());
    assert.equal(otro.status, 409);
    assert.equal(((await otro.json()) as { codigo: string }).codigo, 'INCIDENTE_CERRADO');
    const distinto = await post(ANA, `/incidentes/${id}/cierre`, { ...cuerpo, resumen: 'Otro resumen' });
    assert.equal(distinto.status, 409);
    assert.equal(((await distinto.json()) as { codigo: string }).codigo, 'OPERACION_YA_REGISTRADA');
  });

  it('CA-2: tras el cierre la bitácora se lee (200, estado cerrado, entradas previas intactas y la de cierre al final) y escribir da 409', async () => {
    const { id } = nuevoIncidente();
    const previa = await post(ANA, `/incidentes/${id}/bitacora`, { operacionId: randomUUID(), texto: 'Nota previa' });
    assert.equal(previa.status, 201);
    assert.equal((await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre({ resumen: 'Resumen de cierre' }))).status, 201);

    const lectura = await get(BETO, `/incidentes/${id}/bitacora`);
    assert.equal(lectura.status, 200);
    const { bitacora: b } = (await lectura.json()) as {
      bitacora: { estado: string; puedeEscribir: boolean; entradas: { tipo: string; texto: string }[] };
    };
    assert.equal(b.estado, 'cerrado');
    assert.equal(b.puedeEscribir, false);
    assert.deepEqual(b.entradas.map((e) => [e.tipo, e.texto]), [['nota', 'Nota previa'], ['cierre', 'Resumen de cierre']]);

    const escritura = await post(ANA, `/incidentes/${id}/bitacora`, { operacionId: randomUUID(), texto: 'Tarde' });
    assert.equal(escritura.status, 409);
    assert.equal(((await escritura.json()) as { codigo: string }).codigo, 'INCIDENTE_CERRADO');
  });

  it('GET /alertas/:expedicionId/cierre da null antes del cierre y el informe después, con esMio según quien consulta', async () => {
    const { id, expedicionId } = nuevoIncidente();
    const antes = await get(ANA, `/alertas/${expedicionId}/cierre`);
    assert.equal(antes.status, 200);
    assert.deepEqual(await antes.json(), { cierre: null });

    await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre({ resultado: 'falsa_alarma', resumen: 'Falsa alarma confirmada' }));
    const comoAna = (await (await get(ANA, `/alertas/${expedicionId}/cierre`)).json()) as { cierre: { resultado: string; cerradoPor: { esMio: boolean } } };
    assert.equal(comoAna.cierre.resultado, 'falsa_alarma');
    assert.equal(comoAna.cierre.cerradoPor.esMio, true);
    const comoBeto = (await (await get(BETO, `/alertas/${expedicionId}/cierre`)).json()) as { cierre: { cerradoPor: { esMio: boolean } } };
    assert.equal(comoBeto.cierre.cerradoPor.esMio, false);
  });

  it('CA-3: si el senderista ya confirmó su retorno, el informe lo refleja y el cierre no lo cambió', async () => {
    const { id, expedicionId } = nuevoIncidente();
    cierre.sembrarExpedicion(expedicionId, 'completada');
    const res = await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre());
    const { cierre: informe } = (await res.json()) as { cierre: { estadoExpedicion: string; retornoConfirmadoPorSenderista: boolean } };
    assert.equal(informe.estadoExpedicion, 'completada');
    assert.equal(informe.retornoConfirmadoPorSenderista, true);
    assert.equal(cierre.estadoExpedicion(expedicionId), 'completada');
  });

  it('tras el relevo, ANA recibe 403 y BETO cierra', async () => {
    const { id } = nuevoIncidente();
    bitacora.relevar(id, BETO);
    const a = await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre());
    assert.equal(a.status, 403);
    assert.equal(((await a.json()) as { responsableVigente: { responsableId: string } }).responsableVigente.responsableId, BETO);
    assert.equal((await post(BETO, `/incidentes/${id}/cierre`, cuerpoCierre())).status, 201);
  });

  it('ninguna respuesta de negocio es 401 ni trae datos médicos', async () => {
    const { id } = nuevoIncidente('abierto');
    const respuestas = [
      await post(ANA, `/incidentes/${INEXISTENTE}/cierre`, cuerpoCierre()),
      await post(BETO, `/incidentes/${id}/cierre`, cuerpoCierre()),
      await post(ANA, `/incidentes/${id}/cierre`, cuerpoCierre()),
      await post(ANA, `/incidentes/${id}/localizacion`, { operacionId: randomUUID() }),
    ];
    for (const res of respuestas) {
      assert.notEqual(res.status, 401);
      assert.ok(!PATRON_MEDICO.test(await res.text()));
    }
  });
});
