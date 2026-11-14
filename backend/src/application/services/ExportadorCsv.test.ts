import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IncidenteReporte } from '../../domain/repositories/ILectorPaginasReporteIncidentes.js';
import { FiltrosReporteIncidentes } from '../../domain/value-objects/FiltrosReporteIncidentes.js';
import { IteradorIncidentesReporte } from '../iterators/IteradorIncidentesReporte.js';
import { ExportadorCsv } from './ExportadorCsv.js';

const base: IncidenteReporte = {
  id: '00000000-0000-4000-8000-000000000001', zona: 'Huascarán',
  abiertoEn: '2026-11-01T12:00:00.000Z', cerradoEn: null, estado: 'abierto', resultado: null,
};
async function* recorrido(filas: readonly IncidenteReporte[]) { yield* filas; }
async function contenido(filas: AsyncIterable<IncidenteReporte>): Promise<string> {
  let csv = '';
  for await (const parte of new ExportadorCsv().exportar(filas)) csv += parte;
  return csv;
}

/** Lector independiente del serializador: soporta comillas, comas y saltos internos. */
function leerCsv(csv: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], valor = '', comillas = false;
  const texto = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (comillas && texto[i + 1] === '"') { valor += '"'; i++; }
      else comillas = !comillas;
    } else if (!comillas && c === ',') { fila.push(valor); valor = ''; }
    else if (!comillas && c === '\r' && texto[i + 1] === '\n') {
      fila.push(valor); filas.push(fila); fila = []; valor = ''; i++;
    } else valor += c;
  }
  assert.equal(comillas, false, 'El CSV no debe terminar dentro de una celda');
  assert.deepEqual(fila, [], 'Todas las filas terminan en CRLF');
  assert.equal(valor, '');
  return filas;
}

describe('HU-48: ExportadorCsv', () => {
  it('emite BOM, seis encabezados estables y solo los campos mínimos', async () => {
    const csv = await contenido(recorrido([{ ...base, fichaMedica: 'secreto médico', contactos: ['privado@example.invalid'] } as IncidenteReporte]));
    assert.ok(csv.startsWith('\uFEFF'));
    const filas = leerCsv(csv);
    assert.deepEqual(filas[0], ['id', 'zona', 'fecha_apertura', 'fecha_cierre', 'estado', 'resultado']);
    assert.deepEqual(filas[1], [base.id, 'Huascarán', base.abiertoEn, '', 'abierto', '']);
    assert.doesNotMatch(csv, /secreto|contactos|privado@example/);
  });

  it('conserva comas, comillas, acentos y saltos de línea dentro de una celda', async () => {
    const zona = 'Áncash, "Laguna 69"\r\nSector sur; quebrada';
    const csv = await contenido(recorrido([{ ...base, zona }]));
    assert.ok(csv.includes('"Áncash, ""Laguna 69""\r\nSector sur; quebrada"'));
    assert.equal(leerCsv(csv)[1][1], zona);
    assert.equal(leerCsv(csv).length, 2);
    assert.equal(Buffer.from(csv, 'utf8').toString('utf8'), csv);
  });

  it('un conjunto vacío devuelve únicamente los encabezados', async () => {
    assert.deepEqual(leerCsv(await contenido(recorrido([]))), [
      ['id', 'zona', 'fecha_apertura', 'fecha_cierre', 'estado', 'resultado'],
    ]);
  });

  it('incluye cierre y resultado cuando existen y deja vacíos los históricos sin informe', async () => {
    const cerrado = { ...base, cerradoEn: '2026-11-02T14:00:00.000Z', estado: 'cerrado' as const };
    const filas = leerCsv(await contenido(recorrido([cerrado, { ...cerrado, resultado: 'evacuado' }])));
    assert.deepEqual(filas[1].slice(3), [cerrado.cerradoEn, 'cerrado', '']);
    assert.deepEqual(filas[2].slice(3), [cerrado.cerradoEn, 'cerrado', 'evacuado']);
  });

  it('neutraliza prefijos de fórmula y variantes de ancho completo sin borrar el texto', async () => {
    for (const zona of ['=1+2', '+SUM(1,2)', '-1+2', '@SUM(1,2)', '＝1+2', '＋1', '－1', '＠SUM(1,2)',
      '   =1+2', '\t=1+2', '\r\n+1+2', '\uFEFF@SUM(1,2)', '\u200B=1+2', '=1+2";=1+2']) {
      const filas = leerCsv(await contenido(recorrido([{ ...base, zona }])));
      assert.equal(filas[1][1], `\t${zona}`);
      assert.equal(filas[1].length, 6);
    }
  });

  it('no altera guiones internos, arrobas internas ni texto normal', async () => {
    for (const zona of ['Nevado - sector A', 'Ruta @ Mirador', 'Cañón del Colca', '123 sector']) {
      assert.equal(leerCsv(await contenido(recorrido([{ ...base, zona }])))[1][1], zona);
    }
  });

  it('exporta 1000 filas a través del Iterator paginado, sin omisiones ni duplicados', async () => {
    const datos = Array.from({ length: 1000 }, (_, i) => ({
      ...base, id: `00000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
      zona: `Áncash, "sector ${i + 1}"`,
    }));
    let paginas = 0;
    const iterador = new IteradorIncidentesReporte({ leerPagina: async (_a, _f, pagina) => {
      paginas++;
      const restantes = datos.filter(d => !pagina.despuesDe || d.id > pagina.despuesDe);
      return { incidentes: restantes.slice(0, pagina.tamano), hayMas: restantes.length > pagina.tamano };
    } }, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', new FiltrosReporteIncidentes({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-13' }));
    const filas = leerCsv(await contenido(iterador));
    assert.equal(paginas, 5);
    assert.equal(filas.length, 1001);
    assert.equal(new Set(filas.slice(1).map(f => f[0])).size, 1000);
    assert.deepEqual(filas.slice(1).map(f => f[0]), datos.map(d => d.id));
    assert.deepEqual(filas.slice(1).map(f => f[1]), datos.map(d => d.zona));
    assert.ok(filas.every(f => f.length === 6));
  });

  it('la cabecera no consume el recorrido y cancelar cierra el iterador de origen', async () => {
    let lecturas = 0, cerrado = false;
    async function* origen() {
      try { lecturas++; yield base; lecturas++; yield base; }
      finally { cerrado = true; }
    }
    const csv = new ExportadorCsv().exportar(origen());
    await csv.next(); assert.equal(lecturas, 0);
    await csv.next(); assert.equal(lecturas, 1);
    await csv.return(undefined);
    assert.equal(cerrado, true);
    assert.equal(lecturas, 1);
  });

  it('propaga errores del recorrido en vez de terminar como una exportación correcta', async () => {
    const fallo = new Error('Fallo de la segunda página');
    async function* origen() { yield base; throw fallo; }
    await assert.rejects(contenido(origen()), e => e === fallo);
  });
});
