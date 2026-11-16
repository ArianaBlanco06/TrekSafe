import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { IIncidenteDAO, Coordinacion } from '../../../domain/repositories/IIncidenteDAO.js';
import type { ExpedicionMonitorLeida } from '../../../application/ports/RepositorioRescate.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';

// Se carga la configuración histórica antes de sustituir el entorno que leen sus clientes.
await import('../../../infrastructure/config/env.js');
Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-prioridad',
  JWT_SECRET: 'secreto-ficticio-prioridad-000000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { ServicioRescate } = await import('../../../application/services/servicioRescate.js');
const { crearRutasRescate } = await import('./rutasRescate.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const { errorHandler } = await import('../../../shared/errors/errorHandler.js');

const RESCATISTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIN_PERFIL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COORDINACION: Coordinacion = {
  incidenteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  version: 1,
  responsableId: RESCATISTA,
  nombreResponsable: 'Rescatista de prueba',
  asumidoEn: '2030-01-15T09:00:00Z',
  esMia: true,
};

const ahora = Date.parse('2030-01-15T12:00:00Z');
function fila(id: string, minutosHastaLimite: number, acompanantes: number): ExpedicionMonitorLeida {
  return {
    id,
    estado: 'alerta',
    lugarInicio: 'Inicio ficticio',
    lugarFin: 'Destino ficticio',
    coordenadasInicio: null,
    coordenadasFin: null,
    horaInicio: new Date(ahora - 600 * 60_000).toISOString(),
    horaRetornoEstimada: new Date(ahora + (minutosHastaLimite - 30) * 60_000).toISOString(),
    minutosTolerancia: 30,
    actualizadoEn: new Date(ahora - 30 * 60_000).toISOString(),
    numeroParticipantes: 1 + acompanantes,
    senderista: { nombreCompleto: 'Senderista de prueba', telefono: '900000000' },
  };
}

function crearContexto() {
  const filas = [fila('c', -60, 7), fila('b', -120, 1), fila('a', -120, 1)];
  const enCurso = { ...fila('d', 180, 20), estado: 'en_progreso' as const };
  const lecturas: string[][] = [];
  const zonas: (string | undefined)[] = [];
  const incidentes: IIncidenteDAO = {
    asumir: async () => { throw new Error('Ordenar no debe escribir coordinaciones'); },
    leerCoordinaciones: async (ids) => {
      lecturas.push([...ids]);
      return new Map([['a', COORDINACION]]);
    },
  };
  const repo = {
    verificarEsRescatista: async (id: string) => {
      if (id !== RESCATISTA) throw new ErrorAplicacion(403, 'Perfil requerido', 'NO_ES_RESCATISTA');
    },
    listarExpedicionesMonitor: async (zona?: string) => {
      zonas.push(zona);
      return [...filas, enCurso];
    },
    listarExpedicionesEnAlerta: async () => filas,
    buscarConfirmacionesPorExpediciones: async () => new Map(),
  };
  const servicio = new ServicioRescate(
    repo as never, {} as never, incidentes,
    { ahora: () => new Date(ahora) },
  );
  return { servicio, filas, enCurso, lecturas, zonas };
}

type ListaRespuesta = { alertas?: { expedicionId: string; numeroParticipantes: number }[]; expediciones?: { expedicionId: string }[] };

describe('HU-43: prioridad en el servicio de rescate', () => {
  it('selecciona las estrategias, conserva las mismas alertas y mantiene la coordinación de HU-39', async () => {
    const { servicio, lecturas } = crearContexto();
    const tiempo = await servicio.listarAlertas(RESCATISTA, { criterio: 'tiempo_excedido' });
    const grupo = await servicio.listarAlertas(RESCATISTA, { criterio: 'tamano_grupo' });
    assert.deepEqual(tiempo.map((item) => item.expedicionId), ['a', 'b', 'c']);
    assert.deepEqual(grupo.map((item) => item.expedicionId), ['c', 'a', 'b']);
    assert.deepEqual([...grupo].sort((a, b) => a.expedicionId.localeCompare(b.expedicionId)), tiempo);
    assert.deepEqual(grupo.find((item) => item.expedicionId === 'a')?.coordinacion, COORDINACION);
    assert.equal(lecturas.length, 2, 'una lectura de coordinaciones por consulta');
  });

  it('conserva el total normalizado de participantes, incluido un viaje individual', async () => {
    const { servicio, filas } = crearContexto();
    filas[0]!.numeroParticipantes = 1;
    const items = await servicio.listarAlertas(RESCATISTA);
    assert.equal(items.find((item) => item.expedicionId === 'c')?.numeroParticipantes, 1);
    assert.equal(items.find((item) => item.expedicionId === 'a')?.numeroParticipantes, 2);
    assert.ok(items.every((item) => !('acompanantes_expedicion' in item)));
  });

  it('preserva los grupos operativos del monitor y el filtro de zona', async () => {
    const { servicio, zonas } = crearContexto();
    const items = await servicio.listarExpediciones(RESCATISTA, { criterio: 'tamano_grupo', zona: 'Destino' });
    assert.deepEqual(items.map((item) => item.expedicionId), ['c', 'a', 'b', 'd']);
    assert.deepEqual(zonas, ['Destino']);
    assert.equal(items.at(-1)?.estado, 'en_progreso');
    assert.equal(items[0]?.minutosExcedidos, 60, 'calcula los plazos con el reloj inyectado de DEP-107');
  });

  it('ordena sin modificar los datos persistidos de estados, plazos o participantes', async () => {
    const { servicio, filas, enCurso } = crearContexto();
    const originales = structuredClone({ filas, enCurso });
    for (const criterio of ['tiempo_excedido', 'tamano_grupo'] as const) {
      await servicio.listarAlertas(RESCATISTA, { criterio });
      await servicio.listarExpediciones(RESCATISTA, { criterio });
    }
    assert.deepEqual({ filas, enCurso }, originales);
  });

  it('el valor predeterminado coincide con tiempo excedido y admite fixtures anteriores sin conteo', async () => {
    const { servicio, filas } = crearContexto();
    delete filas[0]!.numeroParticipantes;
    const predeterminado = await servicio.listarAlertas(RESCATISTA);
    assert.deepEqual(predeterminado, await servicio.listarAlertas(RESCATISTA, { criterio: 'tiempo_excedido' }));
    assert.equal(predeterminado.find((item) => item.expedicionId === 'c')?.numeroParticipantes, 1);
  });
});

describe('HU-43: GET /api/rescate/alertas y /expediciones', () => {
  let servidor: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;
  const contexto = crearContexto();
  const cabeceras = (sub = RESCATISTA, rol: 'rescatista' | 'senderista' = 'rescatista') => ({
    Authorization: `Bearer ${firmarToken({ sub, rol })}`,
  });

  before(async () => {
    const app = express();
    app.use('/api/rescate', crearRutasRescate({ servicio: contexto.servicio }));
    app.use(errorHandler);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate`;
  });

  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  for (const endpoint of ['alertas', 'expediciones'] as const) {
    it(`${endpoint}: conserva la llamada existente sin criterio`, async () => {
      const respuesta = await fetch(`${base}/${endpoint}`, { headers: cabeceras() });
      assert.equal(respuesta.status, 200);
      const contenido = await respuesta.json() as ListaRespuesta;
      const items = contenido[endpoint]!;
      assert.deepEqual(items.slice(0, 3).map((item) => item.expedicionId), ['a', 'b', 'c']);
    });

    it(`${endpoint}: aplica ambos criterios desde HTTP`, async () => {
      for (const [criterio, esperado] of [
        ['tiempo_excedido', ['a', 'b', 'c']],
        ['tamano_grupo', ['c', 'a', 'b']],
      ] as const) {
        const respuesta = await fetch(`${base}/${endpoint}?criterio=${criterio}`, { headers: cabeceras() });
        assert.equal(respuesta.status, 200);
        const contenido = await respuesta.json() as ListaRespuesta;
        assert.deepEqual(contenido[endpoint]!.slice(0, 3).map((item) => item.expedicionId), esperado);
      }
    });

    it(`${endpoint}: rechaza criterios desconocidos o repetidos antes de consultar datos`, async () => {
      const lecturasPrevias = contexto.lecturas.length;
      for (const consulta of ['criterio=medico', 'criterio=', 'criterio=tiempo_excedido&criterio=tamano_grupo']) {
        const respuesta = await fetch(`${base}/${endpoint}?${consulta}`, { headers: cabeceras() });
        assert.equal(respuesta.status, 400);
      }
      assert.equal(contexto.lecturas.length, lecturasPrevias);
    });

    it(`${endpoint}: conserva autenticación, rol y perfil de rescatista`, async () => {
      assert.equal((await fetch(`${base}/${endpoint}`)).status, 401);
      assert.equal((await fetch(`${base}/${endpoint}`, { headers: cabeceras(RESCATISTA, 'senderista') })).status, 403);
      assert.equal((await fetch(`${base}/${endpoint}`, { headers: cabeceras(SIN_PERFIL) })).status, 403);
    });
  }
});
