import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ILectorPaginasReporteIncidentes, IncidenteReporte, PaginaIncidentesReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { IteradorIncidentesReporte } from './IteradorIncidentesReporte.js';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const filtros = new FiltrosReporteIncidentes({
  fechaDesde: '2026-11-01', fechaHasta: '2026-11-13', criterioFecha: 'cierre', resultado: 'evacuado', zona: 'Huaraz',
});
function fila(numero: number): IncidenteReporte {
  return {
    id: `00000000-0000-4000-8000-${numero.toString(16).padStart(12, '0')}`,
    zona: 'Huaraz', abiertoEn: '2026-11-01T12:00:00.000Z', cerradoEn: '2026-11-02T12:00:00.000Z',
    estado: 'cerrado', resultado: 'evacuado',
  };
}
async function recolectar<T>(recorrido: AsyncIterable<T>): Promise<T[]> {
  const elementos: T[] = [];
  for await (const elemento of recorrido) elementos.push(elemento);
  return elementos;
}

describe('HU-48: Iterator de incidentes por páginas', () => {
  it('recorre 1000 incidentes por cinco páginas con el mismo actor y filtros', async () => {
    const datos = Array.from({ length: 1000 }, (_, i) => fila(i + 1));
    const cursores: (string | null)[] = [];
    const lector: ILectorPaginasReporteIncidentes = {
      async leerPagina(actor, recibidos, pagina) {
        assert.equal(actor, ACTOR);
        assert.equal(recibidos, filtros);
        cursores.push(pagina.despuesDe);
        const restantes = datos.filter(d => pagina.despuesDe === null || d.id > pagina.despuesDe);
        return { incidentes: restantes.slice(0, pagina.tamano), hayMas: restantes.length > pagina.tamano };
      },
    };
    const leidos = await recolectar(new IteradorIncidentesReporte(lector, ACTOR, filtros));
    assert.deepEqual(leidos, datos);
    assert.equal(new Set(leidos.map(d => d.id)).size, 1000);
    assert.deepEqual(cursores, [null, datos[199].id, datos[399].id, datos[599].id, datos[799].id]);
  });

  it('un conjunto vacío termina después de una sola consulta', async () => {
    let llamadas = 0;
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async () => {
      llamadas++; return { incidentes: [], hayMas: false };
    } };
    assert.deepEqual(await recolectar(new IteradorIncidentesReporte(lector, ACTOR, filtros)), []);
    assert.equal(llamadas, 1);
  });

  it('carga cada página al necesitarla y detener el consumo no solicita la siguiente', async () => {
    let llamadas = 0;
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async () => {
      llamadas++; return { incidentes: [fila(1), fila(2)], hayMas: true };
    } };
    const recorrido = new IteradorIncidentesReporte(lector, ACTOR, filtros, 2);
    assert.equal(llamadas, 0);
    const iterador = recorrido[Symbol.asyncIterator]();
    assert.equal((await iterador.next()).value?.id, fila(1).id);
    assert.equal((await iterador.next()).value?.id, fila(2).id);
    await iterador.return(undefined);
    assert.equal(llamadas, 1);
  });

  it('un fallo de persistencia en otra página interrumpe el recorrido', async () => {
    let llamadas = 0;
    const fallo = new ErrorAplicacion(500, 'Fallo de consulta', 'REPORTE_NO_DISPONIBLE');
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async () => {
      if (llamadas++) throw fallo;
      return { incidentes: [fila(1)], hayMas: true };
    } };
    await assert.rejects(recolectar(new IteradorIncidentesReporte(lector, ACTOR, filtros)), e => e === fallo);
    assert.equal(llamadas, 2);
  });

  it('la pérdida de autorización entre páginas se propaga', async () => {
    const rechazo = new ErrorAplicacion(403, 'Perfil no validado', 'RESCATISTA_NO_VALIDADO');
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async (_actor, _filtros, pagina) => {
      if (pagina.despuesDe) throw rechazo;
      return { incidentes: [fila(1)], hayMas: true };
    } };
    await assert.rejects(recolectar(new IteradorIncidentesReporte(lector, ACTOR, filtros)), e => e === rechazo);
  });

  it('rechaza páginas que repiten ids o retroceden, incluso dentro de una página', async () => {
    for (const repetida of [[fila(1)], [fila(2), fila(1)], [fila(2), fila(2)]]) {
      let llamadas = 0;
      const lector: ILectorPaginasReporteIncidentes = { leerPagina: async () => {
        llamadas++;
        return llamadas === 1 ? { incidentes: [fila(1)], hayMas: true } : { incidentes: repetida, hayMas: false };
      } };
      await assert.rejects(recolectar(new IteradorIncidentesReporte(lector, ACTOR, filtros)), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion); assert.equal(e.codigo, 'REPORTE_NO_DISPONIBLE'); return true;
      });
      assert.equal(llamadas, 2);
    }
  });

  it('rechaza una página vacía con hayMas y respuestas fuera del contrato', async () => {
    const invalidas: unknown[] = [
      { incidentes: [], hayMas: true }, { incidentes: [fila(1), fila(2)], hayMas: false },
      { incidentes: [{ ...fila(1), id: 'id-no-canonico' }], hayMas: false },
      { incidentes: null, hayMas: false }, { incidentes: [], hayMas: 'true' },
    ];
    for (const invalida of invalidas) {
      const lector: ILectorPaginasReporteIncidentes = { leerPagina: async () => invalida as PaginaIncidentesReporte };
      await assert.rejects(recolectar(new IteradorIncidentesReporte(lector, ACTOR, filtros, 1)), ErrorAplicacion);
    }
  });

  it('cada recorrido comienza en la primera página y mantiene su propio cursor', async () => {
    const cursores: (string | null)[] = [];
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async (_a, _f, p) => {
      cursores.push(p.despuesDe); return { incidentes: [fila(1)], hayMas: false };
    } };
    const recorrido = new IteradorIncidentesReporte(lector, ACTOR, filtros);
    await recolectar(recorrido); await recolectar(recorrido);
    assert.deepEqual(cursores, [null, null]);
  });

  it('rechaza tamaños inválidos antes de consultar', () => {
    const lector: ILectorPaginasReporteIncidentes = { leerPagina: async () => assert.fail('No debe consultar') };
    for (const tamano of [0, -1, 1.5, 501, Number.NaN, Infinity]) {
      assert.throws(() => new IteradorIncidentesReporte(lector, ACTOR, filtros, tamano), RangeError);
    }
  });
});
