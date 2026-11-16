import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { IReporteIncidentesDAO } from '../../../domain/repositories/IReporteIncidentesDAO.js';
import { ConsultarEstadisticasRescate } from '../../../application/use-cases/ConsultarEstadisticasRescate.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';

Object.assign(process.env, {
  NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'jwt-ficticio-estadisticas-0000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-ficticio-estadisticas-00000000000', CRON_ENABLED: 'false',
});
const { crearRutasRescate } = await import('./rutasRescate.js');
const { createApp } = await import('../app.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SIN_PERFIL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FALLA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RANGO = 'fechaDesde=2026-11-01&fechaHasta=2026-11-13';

describe('GET /api/rescate/estadisticas (HU-47)', () => {
  let servidor: Server;
  let base: string;
  const llamadas: string[] = [];
  const dao: IReporteIncidentesDAO = {
    async consultar(actor, filtros) {
      llamadas.push(actor);
      if (actor === SIN_PERFIL) throw new ErrorAplicacion(403, 'Perfil no validado', 'RESCATISTA_NO_VALIDADO');
      if (actor === FALLA) throw new ErrorAplicacion(500, 'No se pudo consultar el reporte', 'REPORTE_NO_DISPONIBLE');
      if (filtros.zona === 'Sin coincidencias') return { atendidos: 0, abiertos: 0, cerrados: 0 };
      return { atendidos: 5, abiertos: 2, cerrados: 3 };
    },
  };
  const get = (query = RANGO, actor = ANA, rol: 'senderista' | 'rescatista' = 'rescatista') => fetch(`${base}?${query}`, {
    headers: { Authorization: `Bearer ${firmarToken({ sub: actor, rol })}` },
  });

  before(async () => {
    const app = createApp({
      config: { apiPrefix: '/api', corsOrigin: '*' }, salud: () => ({ ok: true }),
      rutas: [{ prefijo: '/rescate', router: crearRutasRescate({ consultarEstadisticasRescate: new ConsultarEstadisticasRescate(dao) }) }],
    });
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate/estadisticas`;
  });
  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
  });

  it('sin token o con token inválido devuelve 401 y no consulta', async () => {
    const antes = llamadas.length;
    const encabezados: Record<string, string>[] = [{}, { Authorization: 'Bearer invalido' }];
    for (const headers of encabezados) {
      const res = await fetch(`${base}?${RANGO}`, { headers });
      assert.equal(res.status, 401);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
    assert.equal(llamadas.length, antes);
  });

  it('un senderista recibe 403 antes de llamar al DAO', async () => {
    const antes = llamadas.length;
    const res = await get(RANGO, ANA, 'senderista');
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(llamadas.length, antes);
  });

  it('el JWT rescatista sin perfil validado recibe 403, nunca un resumen vacío', async () => {
    const res = await get(RANGO, SIN_PERFIL);
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await res.json() as { codigo: string }).codigo, 'RESCATISTA_NO_VALIDADO');
  });

  it('dos rescatistas consultan el mismo agregado global con actor tomado del JWT', async () => {
    for (const actor of [ANA, BETO]) {
      const res = await get(RANGO, actor);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const cuerpo = await res.json() as { resumen: unknown; filtros: { criterioFecha: string; zonaHoraria: string } };
      assert.deepEqual(cuerpo.resumen, { atendidos: 5, abiertos: 2, cerrados: 3 });
      assert.equal(cuerpo.filtros.criterioFecha, 'apertura');
      assert.equal(cuerpo.filtros.zonaHoraria, 'UTC');
      assert.equal(llamadas.at(-1), actor);
      assert.deepEqual(Object.keys(cuerpo).sort(), ['filtros', 'resumen']);
    }
  });

  it('un conjunto vacío mantiene el rango y zona aplicados', async () => {
    const res = await get(`${RANGO}&zona=Sin%20coincidencias`);
    const cuerpo = await res.json() as { resumen: unknown; filtros: { zona: string } };
    assert.equal(res.status, 200);
    assert.deepEqual(cuerpo.resumen, { atendidos: 0, abiertos: 0, cerrados: 0 });
    assert.equal(cuerpo.filtros.zona, 'Sin coincidencias');
  });

  it('filtros inválidos o identidad inyectada devuelven 400 sin consultar', async () => {
    const antes = llamadas.length;
    for (const query of [
      '', 'fechaDesde=2026-11-01', 'fechaDesde=2026-02-30&fechaHasta=2026-11-13',
      'fechaDesde=2026-11-15&fechaHasta=2026-11-13',
      `${RANGO}&criterioFecha=retorno`, `${RANGO}&resultado=otro`,
      `${RANGO}&rescatistaId=${BETO}`, `${RANGO}&fechaDesde=2026-11-02`,
      `${RANGO}&zona[texto]=Huaraz`,
    ]) {
      const res = await get(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
    assert.equal(llamadas.length, antes);
  });

  it('conserva códigos de validación de dominio y no convierte un fallo en éxito', async () => {
    const invalida = await get(`${RANGO}&resultado=otro`);
    assert.equal((await invalida.json() as { codigo: string }).codigo, 'RESULTADO_REPORTE_INVALIDO');
    const fallo = await get(RANGO, FALLA);
    assert.equal(fallo.status, 500);
    assert.equal(fallo.headers.get('cache-control'), 'no-store');
    const cuerpo = await fallo.json() as { codigo: string; resumen?: unknown };
    assert.equal(cuerpo.codigo, 'REPORTE_NO_DISPONIBLE');
    assert.equal(cuerpo.resumen, undefined);
  });
});
