import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { ILectorPaginasReporteIncidentes, IncidenteReporte } from '../../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import { ExportarReporteIncidentes } from '../../../application/use-cases/ExportarReporteIncidentes.js';
import { ExportadorCsv } from '../../../application/services/ExportadorCsv.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';

Object.assign(process.env, {
  NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'jwt-ficticio-exportacion-0000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-ficticio-exportacion-0000000000', CRON_ENABLED: 'false',
});
const { crearRutasRescate } = await import('./rutasRescate.js');
const { createApp } = await import('../app.js');
const { firmarToken } = await import('../../../infrastructure/security/jwt.js');
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', SIN_PERFIL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RANGO = 'fechaDesde=2026-11-01&fechaHasta=2026-11-13';
const datos: IncidenteReporte[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`, zona: 'Áncash, "Sector sur"',
  abiertoEn: '2026-11-01T12:00:00.000Z', cerradoEn: null, estado: 'abierto', resultado: null,
}));

describe('GET /api/rescate/estadisticas.csv (HU-48)', () => {
  let servidor: Server, base: string;
  const llamadas: { actor: string; cursor: string | null }[] = [];
  const lector: ILectorPaginasReporteIncidentes = { leerPagina: async (actor, filtros, pagina) => {
    llamadas.push({ actor, cursor: pagina.despuesDe });
    if (actor === SIN_PERFIL) throw new ErrorAplicacion(403, 'Perfil no validado', 'RESCATISTA_NO_VALIDADO');
    if (filtros.zona === 'Fallo inicial' || (filtros.zona === 'Fallo posterior' && pagina.despuesDe)) {
      throw new ErrorAplicacion(500, 'No disponible', 'REPORTE_NO_DISPONIBLE');
    }
    if (filtros.zona === 'Vacío') return { incidentes: [], hayMas: false };
    const restantes = datos.filter(d => !pagina.despuesDe || d.id > pagina.despuesDe);
    return { incidentes: restantes.slice(0, pagina.tamano), hayMas: restantes.length > pagina.tamano };
  } };
  const get = (query = RANGO, actor = ANA, rol: 'senderista' | 'rescatista' = 'rescatista') => fetch(`${base}?${query}`, {
    headers: { Authorization: `Bearer ${firmarToken({ sub: actor, rol })}` },
  });
  before(async () => {
    const app = createApp({ config: { apiPrefix: '/api', corsOrigin: '*' }, salud: () => ({ ok: true }),
      rutas: [{ prefijo: '/rescate', router: crearRutasRescate({ exportarReporteIncidentes: new ExportarReporteIncidentes(lector, new ExportadorCsv()) }) }],
    });
    servidor = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/rescate/estadisticas.csv`;
  });
  after(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve, reject) => servidor.close(e => e ? reject(e) : resolve()));
  });

  it('sin autenticación o con rol senderista rechaza antes de leer páginas', async () => {
    const antes = llamadas.length;
    assert.equal((await fetch(`${base}?${RANGO}`)).status, 401);
    assert.equal((await get(RANGO, ANA, 'senderista')).status, 403);
    assert.equal(llamadas.length, antes);
  });

  it('un perfil no validado recibe JSON 403 sin cabecera de descarga', async () => {
    const res = await get(RANGO, SIN_PERFIL);
    assert.equal(res.status, 403); assert.equal(res.headers.get('content-disposition'), null);
    assert.equal((await res.json() as { codigo: string }).codigo, 'RESCATISTA_NO_VALIDADO');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('descarga 1000 filas con BOM UTF-8, nombre seguro y privacidad', async () => {
    const antes = llamadas.length;
    const res = await get();
    assert.equal(res.status, 200); assert.match(res.headers.get('content-type') ?? '', /^text\/csv; charset=utf-8/);
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="incidentes-apertura-2026-11-01_2026-11-13.csv"');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
    const csv = bytes.toString('utf8');
    assert.equal(csv.split('\r\n').length, 1002);
    assert.ok(csv.includes('"Áncash, ""Sector sur"""'));
    assert.equal(llamadas.length - antes, 5);
    assert.ok(llamadas.slice(antes).every(l => l.actor === ANA));
  });

  it('un conjunto vacío autoriza y devuelve solo encabezados', async () => {
    const res = await get(`${RANGO}&zona=Vac%C3%ADo`);
    assert.equal(res.status, 200);
    assert.equal((await res.text()).split('\r\n').length, 2);
  });

  it('filtros inválidos o identidad inyectada no llegan al DAO ni descargan archivo', async () => {
    const antes = llamadas.length;
    for (const query of ['', `${RANGO}&resultado=otro`, `${RANGO}&rescatistaId=${ANA}`, `${RANGO}&fechaDesde=2026-11-02`]) {
      const res = await get(query); assert.equal(res.status, 400); assert.equal(res.headers.get('content-disposition'), null);
    }
    assert.equal(llamadas.length, antes);
  });

  it('fallo de la primera página devuelve JSON 500 sin empezar un CSV', async () => {
    const res = await get(`${RANGO}&zona=Fallo%20inicial`);
    assert.equal(res.status, 500); assert.equal(res.headers.get('content-disposition'), null);
    assert.equal((await res.json() as { codigo: string }).codigo, 'REPORTE_NO_DISPONIBLE');
  });

  it('un fallo posterior interrumpe el cuerpo en vez de completar un CSV truncado', async () => {
    const antes = llamadas.length;
    let completo = false;
    try { const res = await get(`${RANGO}&zona=Fallo%20posterior`); await res.arrayBuffer(); completo = true; }
    catch { /* La desconexión de la respuesta es el resultado esperado. */ }
    assert.equal(completo, false);
    assert.equal(llamadas.length - antes, 2);
  });
});
