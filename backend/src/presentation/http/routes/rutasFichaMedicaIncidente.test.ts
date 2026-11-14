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
  JWT_SECRET: 'secreto-ficticio-ficha-medica-incidente-0',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { crearRutasRescate } = await import('./rutasRescate.js');
const { FachadaFichaMedicaIncidente } = await import('../../../application/services/FachadaFichaMedicaIncidente.js');
const { ServicioRescate } = await import('../../../application/services/servicioRescate.js');
const { FichaMedicaIncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/FichaMedicaIncidenteDAOMemoria.js');
const { IncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js');
const { DescifradorFichaMedicaAesGcm } = await import('../../../infrastructure/security/DescifradorFichaMedicaAesGcm.js');
const { encriptarCargaUtilMedica } = await import('../../../infrastructure/security/encryption.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SENDERISTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INEXISTENTE = '55555555-5555-4555-8555-555555555555';

const CARGA = { alergias: 'penicilina-ficticia', condiciones: 'asma-ficticia', medicamentos: 'salbutamol-ficticio' };
const VALORES_MEDICOS = [...Object.values(CARGA), 'AB-'];

describe('Ficha médica del incidente: GET /api/rescate/incidentes/:id/ficha-medica (HU-50)', () => {
  const dao = new FichaMedicaIncidenteDAOMemoria();
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;
  const expedicionDe = new Map<string, string>();

  dao.sembrarRescatista(ANA);
  dao.sembrarRescatista(BETO);

  const nuevoIncidente = (estado: 'abierto' | 'localizado' | 'cerrado' = 'abierto', responsableId = ANA) => {
    const id = randomUUID();
    const expedicionId = randomUUID();
    const senderistaId = randomUUID();
    dao.sembrarIncidente({ id, expedicionId, senderistaId, estado, responsableId });
    dao.sembrarFicha(senderistaId, { tipoSangre: 'AB-', cargaCifrada: encriptarCargaUtilMedica(CARGA) });
    expedicionDe.set(id, expedicionId);
    return { id, expedicionId, senderistaId };
  };
  const cabeceras = (sub: string, rol: 'senderista' | 'rescatista' = 'rescatista') => ({
    Authorization: `Bearer ${firmarToken({ sub, rol })}`,
  });
  const get = (sub: string, ruta: string, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}${ruta}`, { headers: cabeceras(sub, rol) });
  const ficha = (id: string) => `/incidentes/${id}/ficha-medica`;

  before(async () => {
    const app = express();
    app.use(express.json());
    // Servicio con repositorios mínimos: solo se usa para comprobar que el detalle ya no trae la ficha.
    const servicio = new ServicioRescate(
      {
        verificarEsRescatista: async () => undefined,
        buscarConfirmacion: async () => null,
        buscarExpedicionEnAlerta: async (id: string) => ({ id, estado: 'alerta', actualizadoEn: new Date().toISOString() }),
      } as never,
      {
        buscarContextoAlertaRescate: async (id: string) => ({
          expedicionId: id, senderistaId: SENDERISTA, nombreCompletoSenderista: 'Senderista Ficticio',
          telefonoSenderista: '999999999', lugarInicio: 'Inicio', lugarFin: 'Destino', coordenadasInicio: null,
          coordenadasFin: null, horaInicio: new Date().toISOString(), horaRetornoEstimada: new Date().toISOString(),
          minutosTolerancia: 30, fechaLimite: new Date().toISOString(), acompanantes: [], contactos: [], contactosEmergencia: [],
        }),
      } as never,
      new IncidenteDAOMemoria(new Map(), new Map()),
    );
    app.use('/api/rescate', crearRutasRescate({
      servicio,
      fichaMedica: new FachadaFichaMedicaIncidente(dao, dao, dao, new DescifradorFichaMedicaAesGcm()),
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

  it('el responsable vigente recibe 200 con exactamente fichaMedica y acceso', async () => {
    const { id } = nuevoIncidente();
    const res = await get(ANA, ficha(id));
    assert.equal(res.status, 200);
    const cuerpo = (await res.json()) as { fichaMedica: Record<string, string>; acceso: Record<string, string> };
    assert.deepEqual(Object.keys(cuerpo).sort(), ['acceso', 'fichaMedica']);
    assert.deepEqual(Object.keys(cuerpo.fichaMedica).sort(), ['alergias', 'condiciones', 'medicamentos', 'tipoSangre']);
    assert.deepEqual(cuerpo.fichaMedica, { tipoSangre: 'AB-', ...CARGA });
    assert.deepEqual(Object.keys(cuerpo.acceso).sort(), ['auditoriaId', 'incidenteId', 'registradoEn']);
    assert.equal(cuerpo.acceso.incidenteId, id);
  });

  it('el acceso queda auditado con el actor, el incidente, la hora del servidor y el motivo', async () => {
    const { id } = nuevoIncidente();
    const antes = dao.accesos.length;
    await get(ANA, ficha(id));
    const res = await get(BETO, ficha(id));
    assert.equal(res.status, 403);
    const nuevos = dao.accesos.slice(antes);
    assert.equal(nuevos.length, 2);
    assert.deepEqual(nuevos.map((a) => [a.actorId, a.incidenteId, a.resultado, a.motivo]), [
      [ANA, id, 'permitido', 'RESPONSABLE_VIGENTE'],
      [BETO, id, 'denegado', 'NO_ES_RESPONSABLE'],
    ]);
    for (const a of nuevos) assert.ok(Math.abs(Date.parse(a.registradoEn) - Date.now()) < 60_000);
  });

  it('otro rescatista recibe 403 ACCESO_FICHA_DENEGADO con exactamente codigo, error, mensaje y motivo, sin datos médicos', async () => {
    const { id } = nuevoIncidente();
    const res = await get(BETO, ficha(id));
    assert.equal(res.status, 403);
    const texto = await res.text();
    const cuerpo = JSON.parse(texto) as Record<string, string>;
    assert.deepEqual(Object.keys(cuerpo).sort(), ['codigo', 'error', 'mensaje', 'motivo']);
    assert.equal(cuerpo.codigo, 'ACCESO_FICHA_DENEGADO');
    assert.equal(cuerpo.motivo, 'NO_ES_RESPONSABLE');
    assert.equal(cuerpo.error, 'ErrorAplicacion');
    assert.ok(!('fichaMedica' in cuerpo));
    for (const valor of VALORES_MEDICOS) assert.ok(!texto.includes(valor), `el rechazo no puede llevar ${valor}`);
  });

  it('un senderista recibe 403 PROHIBIDO, sin token 401, un incidente inexistente 404 y un UUID inválido 400 sin auditar', async () => {
    const { id } = nuevoIncidente();
    const antes = dao.accesos.length;
    const comoSenderista = await get(SENDERISTA, ficha(id), 'senderista');
    assert.equal(comoSenderista.status, 403);
    assert.equal(((await comoSenderista.json()) as { codigo: string }).codigo, 'PROHIBIDO');
    assert.equal((await fetch(`${base}${ficha(id)}`)).status, 401);

    const inexistente = await get(ANA, ficha(INEXISTENTE));
    assert.equal(inexistente.status, 404);
    const cuerpo = (await inexistente.json()) as Record<string, string>;
    assert.deepEqual(cuerpo, { error: 'ErrorAplicacion', mensaje: 'Incidente no encontrado', codigo: 'INCIDENTE_NO_ENCONTRADO', motivo: 'INCIDENTE_NO_ENCONTRADO' });

    const invalido = await get(ANA, ficha('no-es-uuid'));
    assert.equal(invalido.status, 400);
    assert.equal(((await invalido.json()) as { error: string }).error, 'ErrorValidacion');

    // Solo el 404 audita (denegado); el senderista, el 401 y el 400 no tocan la auditoría.
    assert.equal(dao.accesos.length, antes + 1);
    assert.equal(dao.accesos.at(-1)?.motivo, 'INCIDENTE_NO_ENCONTRADO');
  });

  it('relevo: el responsable anterior recibe 403 y el nuevo recibe 200', async () => {
    const { id } = nuevoIncidente();
    assert.equal((await get(ANA, ficha(id))).status, 200);
    dao.transferir(id, BETO);
    const anterior = await get(ANA, ficha(id));
    assert.equal(anterior.status, 403);
    assert.equal(((await anterior.json()) as { motivo: string }).motivo, 'NO_ES_RESPONSABLE');
    assert.equal((await get(BETO, ficha(id))).status, 200);
  });

  it('incidente localizado: 200; cerrado: 403 INCIDENTE_CERRADO', async () => {
    const { id } = nuevoIncidente('localizado');
    assert.equal((await get(ANA, ficha(id))).status, 200);
    dao.cerrar(id);
    const res = await get(ANA, ficha(id));
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { motivo: string }).motivo, 'INCIDENTE_CERRADO');
  });

  it('consentimiento revocado: 403 SIN_CONSENTIMIENTO para el responsable, sin datos médicos', async () => {
    const { id, senderistaId } = nuevoIncidente();
    dao.revocarConsentimiento(senderistaId);
    const res = await get(ANA, ficha(id));
    assert.equal(res.status, 403);
    const texto = await res.text();
    assert.equal((JSON.parse(texto) as { motivo: string }).motivo, 'SIN_CONSENTIMIENTO');
    for (const valor of VALORES_MEDICOS) assert.ok(!texto.includes(valor));
  });

  it('GET /alertas/:expedicionId ya no trae fichaMedica ni datos médicos, aunque el responsable consulte', async () => {
    const { id, expedicionId } = nuevoIncidente();
    const antes = dao.accesos.length;
    const res = await get(ANA, `/alertas/${expedicionId}`);
    assert.equal(res.status, 200);
    const texto = await res.text();
    const detalle = JSON.parse(texto) as Record<string, unknown>;
    assert.equal('fichaMedica' in detalle, false);
    for (const valor of VALORES_MEDICOS) assert.ok(!texto.includes(valor));
    assert.equal(dao.accesos.length, antes, 'abrir el detalle no audita ni lee la ficha');
    assert.ok(expedicionDe.get(id));
  });
});
