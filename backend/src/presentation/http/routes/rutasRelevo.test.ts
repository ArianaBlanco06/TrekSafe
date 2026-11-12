import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';

// Las rutas importan módulos que leen el entorno al cargarse; se fija antes de importarlas.
Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'secreto-ficticio-relevo-0000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { crearRutasRescate } = await import('./rutasRescate.js');
const { AceptarRelevo } = await import('../../../application/use-cases/AceptarRelevo.js');
const { CancelarRelevo } = await import('../../../application/use-cases/CancelarRelevo.js');
const { RechazarRelevo } = await import('../../../application/use-cases/RechazarRelevo.js');
const { AsignarResponsable } = await import('../../../application/use-cases/AsignarResponsable.js');
const { ProponerRelevo } = await import('../../../application/use-cases/ProponerRelevo.js');
const { IncidenteDAOMemoria } = await import('../../../infrastructure/repositories/memoria/IncidenteDAOMemoria.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');
type Incidente = import('../../../domain/repositories/IIncidenteDAO.js').Incidente;

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // responsable
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // destinatario
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SIN_PERFIL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // rol rescatista en el JWT, sin perfil validado
const SENDERISTA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ALERTA = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const SIN_INCIDENTE = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const CERRADA = 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3';

const CLAVES_COORDINACION = ['asumidoEn', 'esMia', 'incidenteId', 'nombreResponsable', 'relevoPendiente', 'responsableId', 'version'];
const CLAVES_RELEVO_PENDIENTE = ['destinatarioId', 'esParaMi', 'motivo', 'nombreDestinatario', 'relevoId', 'solicitadoEn'];
const PATRON_MEDICO = /sangre|alergi|condicion|medicament|ficha|salud|consentimiento/i;

const incidente = (expedicionId: string, estado: Incidente['estado'], id: string): Incidente => ({
  id,
  expedicionId,
  estado,
  version: 1,
  responsableId: ANA,
  nombreResponsable: 'Ana Rescate',
  asumidoEn: '2030-01-15T12:00:00.000Z',
});

type Cuerpo = Record<string, unknown>;

describe('POST /api/rescate/alertas/:expedicionId/coordinacion/relevos[/:relevoId/aceptar|rechazar|cancelar] (HU-40)', () => {
  let dao = new IncidenteDAOMemoria(new Map(), new Map());
  // El servidor se crea una vez; cada prueba cambia el DAO al que delegan los casos de uso.
  const delegado = {
    asumir: (s: Parameters<typeof dao.asumir>[0]) => dao.asumir(s),
    leerCoordinaciones: (...a: Parameters<typeof dao.leerCoordinaciones>) => dao.leerCoordinaciones(...a),
    proponerRelevo: (s: Parameters<typeof dao.proponerRelevo>[0]) => dao.proponerRelevo(s),
    aceptarRelevo: (s: Parameters<typeof dao.aceptarRelevo>[0]) => dao.aceptarRelevo(s),
    rechazarRelevo: (s: Parameters<typeof dao.rechazarRelevo>[0]) => dao.rechazarRelevo(s),
    cancelarRelevo: (s: Parameters<typeof dao.cancelarRelevo>[0]) => dao.cancelarRelevo(s),
  };
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;

  const cabeceras = (sub: string, rol: 'senderista' | 'rescatista' = 'rescatista') => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${firmarToken({ sub, rol })}`,
  });
  const proponer = (sub: string, cuerpo: unknown, expedicion = ALERTA, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}/${expedicion}/coordinacion/relevos`, { method: 'POST', headers: cabeceras(sub, rol), body: JSON.stringify(cuerpo) });
  const aceptar = (sub: string, relevoId: string, cuerpo: unknown, expedicion = ALERTA, rol: 'senderista' | 'rescatista' = 'rescatista') =>
    fetch(`${base}/${expedicion}/coordinacion/relevos/${relevoId}/aceptar`, {
      method: 'POST',
      headers: cabeceras(sub, rol),
      body: JSON.stringify(cuerpo),
    });
  const resolver = (accion: 'rechazar' | 'cancelar') =>
    (sub: string, relevoId: string, cuerpo: unknown, expedicion = ALERTA, rol: 'senderista' | 'rescatista' = 'rescatista') =>
      fetch(`${base}/${expedicion}/coordinacion/relevos/${relevoId}/${accion}`, {
        method: 'POST',
        headers: cabeceras(sub, rol),
        body: JSON.stringify(cuerpo),
      });
  const rechazar = resolver('rechazar');
  const cancelar = resolver('cancelar');
  const cuerpoProponer = (extra: Cuerpo = {}) => ({
    operacionId: randomUUID(),
    destinatarioId: BETO,
    motivo: 'Cambio de turno',
    versionIncidente: 1,
    ...extra,
  });
  /** Propone como Ana y devuelve el relevo pendiente. */
  async function relevoPendiente(): Promise<string> {
    const res = await proponer(ANA, cuerpoProponer());
    assert.equal(res.status, 201);
    return ((await res.json()) as { coordinacion: { relevoPendiente: { relevoId: string } } }).coordinacion.relevoPendiente.relevoId;
  }

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/rescate',
      crearRutasRescate({
        asignarResponsable: new AsignarResponsable(delegado),
        proponerRelevo: new ProponerRelevo(delegado),
        aceptarRelevo: new AceptarRelevo(delegado),
        rechazarRelevo: new RechazarRelevo(delegado),
        cancelarRelevo: new CancelarRelevo(delegado),
      }),
    );
    app.use(errorHandler);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate/alertas`;
  });

  beforeEach(() => {
    dao = new IncidenteDAOMemoria(
      new Map([[ANA, 'Ana Rescate'], [BETO, 'Beto Rescate'], [CARLA, 'Carla Rescate']]),
      new Map(),
    );
    dao.sembrar(incidente(ALERTA, 'abierto', '00000000-0000-4000-8000-000000000001'));
    dao.sembrar(incidente(CERRADA, 'cerrado', '00000000-0000-4000-8000-000000000003'));
  });

  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  describe('autenticación y validación', () => {
    it('sin token, 401 (la única respuesta 401 de las rutas)', async () => {
      assert.equal((await fetch(`${base}/${ALERTA}/coordinacion/relevos`, { method: 'POST' })).status, 401);
      for (const accion of ['aceptar', 'rechazar', 'cancelar']) {
        assert.equal((await fetch(`${base}/${ALERTA}/coordinacion/relevos/${randomUUID()}/${accion}`, { method: 'POST' })).status, 401);
      }
    });

    it('un senderista recibe 403 PROHIBIDO en todas las rutas del relevo', async () => {
      for (const res of [
        await proponer(SENDERISTA, cuerpoProponer(), ALERTA, 'senderista'),
        await aceptar(SENDERISTA, randomUUID(), { operacionId: randomUUID() }, ALERTA, 'senderista'),
        await rechazar(SENDERISTA, randomUUID(), { operacionId: randomUUID() }, ALERTA, 'senderista'),
        await cancelar(SENDERISTA, randomUUID(), { operacionId: randomUUID() }, ALERTA, 'senderista'),
      ]) {
        assert.equal(res.status, 403);
        assert.equal(((await res.json()) as { codigo: string }).codigo, 'PROHIBIDO');
      }
    });

    it('proponer con un cuerpo inválido o una alerta que no es UUID: 400 ErrorValidacion', async () => {
      for (const cuerpo of [
        {},
        cuerpoProponer({ operacionId: 'no-es-uuid' }),
        cuerpoProponer({ destinatarioId: 'luis' }),
        cuerpoProponer({ motivo: '' }),
        cuerpoProponer({ motivo: 'x'.repeat(281) }),
        cuerpoProponer({ versionIncidente: 0 }),
        cuerpoProponer({ versionIncidente: '1' }),
      ]) {
        const res = await proponer(ANA, cuerpo);
        assert.equal(res.status, 400);
        assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
      }
      assert.equal((await proponer(ANA, cuerpoProponer(), 'no-es-uuid')).status, 400);
      assert.equal(dao.relevos.length, 0);
    });

    it('aceptar con un cuerpo inválido, un relevo o una alerta que no son UUID: 400', async () => {
      const relevoId = await relevoPendiente();
      for (const [sub, rel, cuerpo, exp] of [
        [BETO, relevoId, {}, ALERTA],
        [BETO, relevoId, { operacionId: 'no-es-uuid' }, ALERTA],
        [BETO, 'no-es-uuid', { operacionId: randomUUID() }, ALERTA],
        [BETO, relevoId, { operacionId: randomUUID() }, 'no-es-uuid'],
      ] as [string, string, Cuerpo, string][]) {
        const res = await aceptar(sub, rel, cuerpo, exp);
        assert.equal(res.status, 400);
        assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
      }
      assert.equal(dao.transferencias.length, 0);
    });
  });

  describe('proponer', () => {
    it('CA-01: 201 con la coordinación y el relevo pendiente visto por el responsable', async () => {
      const res = await proponer(ANA, cuerpoProponer());
      assert.equal(res.status, 201);
      const cuerpo = (await res.json()) as { coordinacion: Record<string, unknown> };
      assert.deepEqual(Object.keys(cuerpo), ['coordinacion']);
      assert.deepEqual(Object.keys(cuerpo.coordinacion).sort(), CLAVES_COORDINACION);
      assert.equal(cuerpo.coordinacion.esMia, true);
      assert.equal(cuerpo.coordinacion.responsableId, ANA);
      assert.equal(cuerpo.coordinacion.version, 1);
      const pendiente = cuerpo.coordinacion.relevoPendiente as Record<string, unknown>;
      assert.deepEqual(Object.keys(pendiente).sort(), CLAVES_RELEVO_PENDIENTE);
      assert.equal(pendiente.destinatarioId, BETO);
      assert.equal(pendiente.nombreDestinatario, 'Beto Rescate');
      assert.equal(pendiente.esParaMi, false);
      assert.equal(pendiente.motivo, 'Cambio de turno');
      assert.ok(!PATRON_MEDICO.test(JSON.stringify(cuerpo)), 'la respuesta no lleva datos médicos');
    });

    it('repetir la misma operación responde 200 con el mismo relevo y sin duplicar', async () => {
      const cuerpoRepetido = cuerpoProponer();
      const primera = (await (await proponer(ANA, cuerpoRepetido)).json()) as { coordinacion: { relevoPendiente: { relevoId: string } } };
      const segunda = await proponer(ANA, cuerpoRepetido);
      assert.equal(segunda.status, 200);
      const cuerpo = (await segunda.json()) as typeof primera;
      assert.equal(cuerpo.coordinacion.relevoPendiente.relevoId, primera.coordinacion.relevoPendiente.relevoId);
      assert.equal(dao.relevos.length, 1);
    });

    it('el actor sale del JWT: el cuerpo no puede suplantarlo', async () => {
      const res = await proponer(CARLA, cuerpoProponer({ rescatistaId: ANA }));
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as { codigo: string }).codigo, 'NO_ES_RESPONSABLE');
    });

    const rechazos: [string, number, string, () => Promise<Response>][] = [
      ['rescatista sin perfil validado', 403, 'NO_ES_RESCATISTA', () => proponer(SIN_PERFIL, cuerpoProponer())],
      ['actor que no es el responsable', 403, 'NO_ES_RESPONSABLE', () => proponer(CARLA, cuerpoProponer())],
      ['destinatario igual al actor', 400, 'DESTINATARIO_INVALIDO', () => proponer(ANA, cuerpoProponer({ destinatarioId: ANA }))],
      ['destinatario no validado', 400, 'DESTINATARIO_NO_VALIDADO', () => proponer(ANA, cuerpoProponer({ destinatarioId: SIN_PERFIL }))],
      ['alerta sin incidente', 404, 'INCIDENTE_NO_ENCONTRADO', () => proponer(ANA, cuerpoProponer(), SIN_INCIDENTE)],
      ['caso cerrado', 409, 'INCIDENTE_CERRADO', () => proponer(ANA, cuerpoProponer(), CERRADA)],
    ];
    for (const [descripcion, estado, codigo, llamar] of rechazos) {
      it(`${descripcion}: ${estado} ${codigo}`, async () => {
        const res = await llamar();
        assert.equal(res.status, estado);
        assert.equal(((await res.json()) as { codigo: string }).codigo, codigo);
        assert.equal(dao.relevos.length, 0);
      });
    }

    it('versión desactualizada: 409 VERSION_DESACTUALIZADA con versionActual', async () => {
      const res = await proponer(ANA, cuerpoProponer({ versionIncidente: 7 }));
      assert.equal(res.status, 409);
      const cuerpo = (await res.json()) as { codigo: string; versionActual: number };
      assert.equal(cuerpo.codigo, 'VERSION_DESACTUALIZADA');
      assert.equal(cuerpo.versionActual, 1);
    });

    it('CA-03: con un relevo pendiente, 409 RELEVO_PENDIENTE con el relevo vigente y sin motivo', async () => {
      const relevoId = await relevoPendiente();
      const res = await proponer(ANA, cuerpoProponer({ destinatarioId: CARLA }));
      assert.equal(res.status, 409);
      const cuerpo = (await res.json()) as { codigo: string; relevoPendiente: Record<string, unknown> };
      assert.equal(cuerpo.codigo, 'RELEVO_PENDIENTE');
      assert.equal(cuerpo.relevoPendiente.relevoId, relevoId);
      assert.equal(cuerpo.relevoPendiente.nombreDestinatario, 'Beto Rescate');
      assert.equal('motivo' in cuerpo.relevoPendiente, false);
    });

    it('dos propuestas simultáneas: una responde 201 y la otra 409 RELEVO_PENDIENTE', async () => {
      const [a, b] = await Promise.all([
        proponer(ANA, cuerpoProponer({ destinatarioId: BETO })),
        proponer(ANA, cuerpoProponer({ destinatarioId: CARLA })),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409]);
      const perdedora = a.status === 409 ? a : b;
      assert.equal(((await perdedora.json()) as { codigo: string }).codigo, 'RELEVO_PENDIENTE');
      assert.equal(dao.relevos.length, 1);
    });
  });

  describe('aceptar', () => {
    it('CA-02: 200 con la coordinación ya del destinatario, versión 2 y sin relevo pendiente', async () => {
      const relevoId = await relevoPendiente();
      const res = await aceptar(BETO, relevoId, { operacionId: randomUUID() });
      assert.equal(res.status, 200);
      const cuerpo = (await res.json()) as { coordinacion: Record<string, unknown> };
      assert.deepEqual(Object.keys(cuerpo.coordinacion).sort(), CLAVES_COORDINACION.filter((k) => k !== 'relevoPendiente'));
      assert.equal(cuerpo.coordinacion.esMia, true);
      assert.equal(cuerpo.coordinacion.responsableId, BETO);
      assert.equal(cuerpo.coordinacion.nombreResponsable, 'Beto Rescate');
      assert.equal(cuerpo.coordinacion.version, 2);
      assert.equal(dao.transferencias.length, 1);
      assert.ok(!PATRON_MEDICO.test(JSON.stringify(cuerpo)));
    });

    it('tras aceptar, una lectura de la consola ya muestra al nuevo responsable sin relevo pendiente', async () => {
      const relevoId = await relevoPendiente();
      await aceptar(BETO, relevoId, { operacionId: randomUUID() });
      const coordinacion = (await dao.leerCoordinaciones([ALERTA], ANA)).get(ALERTA);
      assert.equal(coordinacion?.responsableId, BETO);
      assert.equal(coordinacion?.esMia, false);
      assert.equal('relevoPendiente' in (coordinacion ?? {}), false);
    });

    it('repetir la misma operación responde 200 sin volver a escribir; otra operación, 409 RELEVO_YA_RESUELTO', async () => {
      const relevoId = await relevoPendiente();
      const cuerpoAceptar = { operacionId: randomUUID() };
      assert.equal((await aceptar(BETO, relevoId, cuerpoAceptar)).status, 200);
      assert.equal((await aceptar(BETO, relevoId, cuerpoAceptar)).status, 200);
      const otra = await aceptar(BETO, relevoId, { operacionId: randomUUID() });
      assert.equal(otra.status, 409);
      const cuerpoOtra = (await otra.json()) as { codigo: string; estadoRelevo: string };
      assert.equal(cuerpoOtra.codigo, 'RELEVO_YA_RESUELTO');
      assert.equal(cuerpoOtra.estadoRelevo, 'aceptado');
      assert.equal(dao.transferencias.length, 1);
    });

    it('rechazo por actor incorrecto: 403 NO_ES_DESTINATARIO para un tercero y para el responsable anterior', async () => {
      const relevoId = await relevoPendiente();
      for (const sub of [CARLA, ANA]) {
        const res = await aceptar(sub, relevoId, { operacionId: randomUUID() });
        assert.equal(res.status, 403);
        assert.equal(((await res.json()) as { codigo: string }).codigo, 'NO_ES_DESTINATARIO');
      }
      assert.equal(dao.filas[0].incidente.responsableId, ANA);
    });

    it('rescatista sin perfil: 403 NO_ES_RESCATISTA; relevo inexistente o de otra alerta: 404 RELEVO_NO_ENCONTRADO', async () => {
      const relevoId = await relevoPendiente();
      const sinPerfil = await aceptar(SIN_PERFIL, relevoId, { operacionId: randomUUID() });
      assert.equal(sinPerfil.status, 403);
      assert.equal(((await sinPerfil.json()) as { codigo: string }).codigo, 'NO_ES_RESCATISTA');
      for (const res of [
        await aceptar(BETO, randomUUID(), { operacionId: randomUUID() }),
        await aceptar(BETO, relevoId, { operacionId: randomUUID() }, CERRADA),
      ]) {
        assert.equal(res.status, 404);
        assert.equal(((await res.json()) as { codigo: string }).codigo, 'RELEVO_NO_ENCONTRADO');
      }
    });

    it('caso cerrado tras la propuesta: 409 INCIDENTE_CERRADO', async () => {
      const relevoId = await relevoPendiente();
      dao.filas[0].incidente = { ...dao.filas[0].incidente, estado: 'cerrado' };
      const res = await aceptar(BETO, relevoId, { operacionId: randomUUID() });
      assert.equal(res.status, 409);
      assert.equal(((await res.json()) as { codigo: string }).codigo, 'INCIDENTE_CERRADO');
    });

    it('proponer contra aceptar por HTTP: la aceptación responde 200 y la propuesta 403 o 409, nunca dos relevos', async () => {
      const relevoId = await relevoPendiente();
      const [prop, acep] = await Promise.all([
        proponer(ANA, cuerpoProponer({ destinatarioId: CARLA })),
        aceptar(BETO, relevoId, { operacionId: randomUUID() }),
      ]);
      assert.equal(acep.status, 200);
      assert.ok([403, 409].includes(prop.status), `la propuesta respondió ${prop.status}`);
      assert.equal(dao.relevos.length, 1);
      assert.equal(dao.filas[0].incidente.responsableId, BETO);
    });
  });

  for (const [accion, llamar, actor, intruso, codigoIntruso, final] of [
    ['rechazar', rechazar, BETO, ANA, 'NO_ES_DESTINATARIO', 'rechazado'],
    ['cancelar', cancelar, ANA, BETO, 'NO_ES_PROPONENTE', 'cancelado'],
  ] as const) {
    describe(accion, () => {
      it(`200 con la coordinación sin relevo pendiente, con el mismo responsable y la misma versión (${final})`, async () => {
        const relevoId = await relevoPendiente();
        const res = await llamar(actor, relevoId, { operacionId: randomUUID() });
        assert.equal(res.status, 200);
        const cuerpo = (await res.json()) as { coordinacion: Record<string, unknown> };
        assert.deepEqual(Object.keys(cuerpo), ['coordinacion']);
        assert.deepEqual(Object.keys(cuerpo.coordinacion).sort(), CLAVES_COORDINACION.filter((k) => k !== 'relevoPendiente'));
        assert.equal(cuerpo.coordinacion.responsableId, ANA);
        assert.equal(cuerpo.coordinacion.esMia, actor === ANA);
        assert.equal(cuerpo.coordinacion.version, 1);
        assert.equal(dao.relevos[0].relevo.estado, final);
        assert.equal(dao.relevos[0].relevo.resueltoPorId, actor);
        assert.equal(dao.transferencias.length, 0);
        assert.ok(!PATRON_MEDICO.test(JSON.stringify(cuerpo)));
      });

      it('queda libre para proponer otro relevo y la lectura de la consola ya no lo muestra pendiente', async () => {
        const relevoId = await relevoPendiente();
        await llamar(actor, relevoId, { operacionId: randomUUID() });
        assert.equal('relevoPendiente' in ((await dao.leerCoordinaciones([ALERTA], ANA)).get(ALERTA) ?? {}), false);
        const otro = await proponer(ANA, cuerpoProponer({ destinatarioId: CARLA }));
        assert.equal(otro.status, 201);
      });

      it('repetir la misma operación responde 200 sin volver a escribir; otra operación, 409 RELEVO_YA_RESUELTO con el estado', async () => {
        const relevoId = await relevoPendiente();
        const cuerpoOp = { operacionId: randomUUID() };
        assert.equal((await llamar(actor, relevoId, cuerpoOp)).status, 200);
        const instante = dao.relevos[0].relevo.resueltoEn;
        assert.equal((await llamar(actor, relevoId, cuerpoOp)).status, 200);
        assert.equal(dao.relevos[0].relevo.resueltoEn, instante);
        const otra = await llamar(actor, relevoId, { operacionId: randomUUID() });
        assert.equal(otra.status, 409);
        const cuerpo = (await otra.json()) as { codigo: string; estadoRelevo: string };
        assert.equal(cuerpo.codigo, 'RELEVO_YA_RESUELTO');
        assert.equal(cuerpo.estadoRelevo, final);
      });

      it(`403 ${codigoIntruso} para la otra parte y un tercero; 403 NO_ES_RESCATISTA sin perfil`, async () => {
        const relevoId = await relevoPendiente();
        for (const sub of [intruso, CARLA]) {
          const res = await llamar(sub, relevoId, { operacionId: randomUUID() });
          assert.equal(res.status, 403);
          assert.equal(((await res.json()) as { codigo: string }).codigo, codigoIntruso);
        }
        const sinPerfil = await llamar(SIN_PERFIL, relevoId, { operacionId: randomUUID() });
        assert.equal(sinPerfil.status, 403);
        assert.equal(((await sinPerfil.json()) as { codigo: string }).codigo, 'NO_ES_RESCATISTA');
        assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
      });

      it('relevo inexistente o de otra alerta: 404 RELEVO_NO_ENCONTRADO', async () => {
        const relevoId = await relevoPendiente();
        for (const res of [
          await llamar(actor, randomUUID(), { operacionId: randomUUID() }),
          await llamar(actor, relevoId, { operacionId: randomUUID() }, CERRADA),
        ]) {
          assert.equal(res.status, 404);
          assert.equal(((await res.json()) as { codigo: string }).codigo, 'RELEVO_NO_ENCONTRADO');
        }
      });

      it('cuerpo inválido o identificadores que no son UUID: 400 ErrorValidacion', async () => {
        const relevoId = await relevoPendiente();
        for (const [rel, cuerpo, exp] of [
          [relevoId, {}, ALERTA],
          [relevoId, { operacionId: 'no-es-uuid' }, ALERTA],
          ['no-es-uuid', { operacionId: randomUUID() }, ALERTA],
          [relevoId, { operacionId: randomUUID() }, 'no-es-uuid'],
        ] as [string, Cuerpo, string][]) {
          const res = await llamar(actor, rel, cuerpo, exp);
          assert.equal(res.status, 400);
          assert.equal(((await res.json()) as { error: string }).error, 'ErrorValidacion');
        }
        assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
      });

      it('caso cerrado tras la propuesta: 409 INCIDENTE_CERRADO y el relevo sigue pendiente', async () => {
        const relevoId = await relevoPendiente();
        dao.filas[0].incidente = { ...dao.filas[0].incidente, estado: 'cerrado' };
        const res = await llamar(actor, relevoId, { operacionId: randomUUID() });
        assert.equal(res.status, 409);
        assert.equal(((await res.json()) as { codigo: string }).codigo, 'INCIDENTE_CERRADO');
        assert.equal(dao.relevos[0].relevo.estado, 'pendiente');
      });

      it('aceptar contra la resolución por HTTP: una responde 200 y la otra 409 RELEVO_YA_RESUELTO', async () => {
        const relevoId = await relevoPendiente();
        const [acep, resol] = await Promise.all([
          aceptar(BETO, relevoId, { operacionId: randomUUID() }),
          llamar(actor, relevoId, { operacionId: randomUUID() }),
        ]);
        assert.deepEqual([acep.status, resol.status].sort(), [200, 409]);
        const perdedora = acep.status === 409 ? acep : resol;
        assert.equal(((await perdedora.json()) as { codigo: string }).codigo, 'RELEVO_YA_RESUELTO');
        assert.equal(dao.transferencias.length, dao.relevos[0].relevo.estado === 'aceptado' ? 1 : 0);
      });
    });
  }

  it('ningún rechazo de negocio de proponer, aceptar, rechazar ni cancelar responde 401', async () => {
    const relevoId = await relevoPendiente();
    const respuestas = [
      await proponer(SIN_PERFIL, cuerpoProponer()),
      await proponer(CARLA, cuerpoProponer()),
      await proponer(ANA, cuerpoProponer({ destinatarioId: ANA })),
      await proponer(ANA, cuerpoProponer(), SIN_INCIDENTE),
      await proponer(ANA, cuerpoProponer(), CERRADA),
      await proponer(ANA, cuerpoProponer({ versionIncidente: 9 })),
      await proponer(ANA, cuerpoProponer({ destinatarioId: CARLA })),
      await aceptar(CARLA, relevoId, { operacionId: randomUUID() }),
      await aceptar(BETO, randomUUID(), { operacionId: randomUUID() }),
      await rechazar(CARLA, relevoId, { operacionId: randomUUID() }),
      await cancelar(CARLA, relevoId, { operacionId: randomUUID() }),
      await rechazar(BETO, randomUUID(), { operacionId: randomUUID() }),
      await cancelar(ANA, randomUUID(), { operacionId: randomUUID() }),
    ];
    for (const res of respuestas) assert.ok([400, 403, 404, 409].includes(res.status), `estado ${res.status}`);
  });
});
