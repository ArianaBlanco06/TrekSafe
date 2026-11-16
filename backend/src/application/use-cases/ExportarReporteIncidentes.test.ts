import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZodError } from 'zod';
import type { ILectorPaginasReporteIncidentes, IncidenteReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { ExportadorCsv } from '../services/ExportadorCsv.js';
import { ExportarReporteIncidentes } from './ExportarReporteIncidentes.js';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rango = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-13' };
const fila: IncidenteReporte = { id: ACTOR, zona: 'Huaraz', abiertoEn: '2026-11-01T12:00:00.000Z', cerradoEn: null, estado: 'abierto', resultado: null };

describe('ExportarReporteIncidentes (HU-48)', () => {
  it('valida y autoriza la primera página antes de devolver el archivo', async () => {
    let paginas = 0;
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async (actor, filtros) => {
      paginas++; assert.equal(actor, ACTOR); assert.equal(filtros.zona, 'Huaraz');
      assert.equal(filtros.desdeInclusivo, '2026-11-01T00:00:00.000Z');
      return { incidentes: [fila], hayMas: false };
    } };
    const descarga = await new ExportarReporteIncidentes(lector, new ExportadorCsv()).ejecutar(ACTOR, { ...rango, zona: ' Huaraz ' });
    assert.equal(paginas, 1);
    assert.equal(descarga.nombreArchivo, 'incidentes-apertura-2026-11-01_2026-11-13.csv');
    let csv = ''; for await (const parte of descarga.contenido) csv += parte;
    assert.ok(csv.includes('"Huaraz"'));
    assert.equal(paginas, 1);
  });

  it('un reporte vacío también debe autorizarse y produce encabezados', async () => {
    let paginas = 0;
    const descarga = await new ExportarReporteIncidentes({ leerPagina: async () => {
      paginas++; return { incidentes: [], hayMas: false };
    } }, new ExportadorCsv()).ejecutar(ACTOR, rango);
    assert.equal(paginas, 1);
    const partes = []; for await (const parte of descarga.contenido) partes.push(parte);
    assert.equal(partes.length, 1);
    assert.match(partes[0], /"id","zona","fecha_apertura"/);
  });

  it('un perfil rechazado o fallo inicial no devuelve un archivo ni encabezados', async () => {
    for (const estado of [403, 500]) {
      const fallo = new ErrorAplicacion(estado, 'Consulta rechazada');
      const caso = new ExportarReporteIncidentes({ leerPagina: async () => { throw fallo; } }, new ExportadorCsv());
      await assert.rejects(caso.ejecutar(ACTOR, rango), e => e === fallo);
    }
  });

  it('reutiliza la validación de HU-47 antes de acceder a la persistencia', async () => {
    const caso = new ExportarReporteIncidentes({ leerPagina: async () => assert.fail('No debe consultar') }, new ExportadorCsv());
    await assert.rejects(caso.ejecutar(ACTOR, { ...rango, rescatistaId: ACTOR }), ZodError);
    await assert.rejects(caso.ejecutar('invalido', rango), ZodError);
    await assert.rejects(caso.ejecutar(ACTOR, { ...rango, fechaDesde: '2026-11-30' }), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion); assert.equal(e.codigoEstado, 400); return true;
    });
  });

  it('cancelar después de la primera lectura impide consultar otra página', async () => {
    let paginas = 0;
    const descarga = await new ExportarReporteIncidentes({ leerPagina: async () => {
      paginas++; return { incidentes: [fila], hayMas: true };
    } }, new ExportadorCsv()).ejecutar(ACTOR, rango);
    await descarga.cancelar();
    assert.equal(paginas, 1);
  });

  it('un error posterior se propaga durante la producción del CSV', async () => {
    const fallo = new ErrorAplicacion(500, 'No disponible', 'REPORTE_NO_DISPONIBLE');
    const descarga = await new ExportarReporteIncidentes({ leerPagina: async (_a, _f, pagina) => {
      if (pagina.despuesDe) throw fallo;
      return { incidentes: [fila], hayMas: true };
    } }, new ExportadorCsv()).ejecutar(ACTOR, rango);
    await assert.rejects(async () => { for await (const _parte of descarga.contenido) { /* consumir */ } }, e => e === fallo);
  });
});
