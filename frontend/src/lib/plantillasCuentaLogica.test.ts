// Prueba de lógica pura. Se ejecuta con el runner del backend (el frontend no tiene runner propio):
//   node --import tsx --test ../frontend/src/lib/plantillasCuentaLogica.test.ts   (desde backend/)
// El tsconfig del frontend la excluye porque no incluye tipos de Node.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveCachePlantillas,
  construirBorradorDesdeCache,
  crearSobreCache,
  mensajeAplicacionBorrador,
  ordenarPlantillas,
  plantillasDesdeSobre,
  type PlantillaCuenta,
} from './plantillasCuentaLogica';

const plantilla = (id: string, extra: Partial<PlantillaCuenta> = {}): PlantillaCuenta => ({
  id,
  nombre: `Plantilla ${id}`,
  lugarInicio: 'Cebollapampa',
  lugarFin: 'Laguna 69',
  coordenadasInicio: null,
  coordenadasFin: '-9.01050, -77.60420',
  minutosTolerancia: 30,
  idsContactos: ['c1', 'c2', 'c3'],
  nombresAcompanantes: ['Ana Torres'],
  version: 1,
  creadoEn: '2026-10-26T10:00:00.000Z',
  actualizadoEn: '2026-10-26T10:00:00.000Z',
  ...extra,
});

describe('caché de plantillas por usuario', () => {
  it('la clave incluye versión de esquema y usuario', () => {
    assert.equal(claveCachePlantillas('u1'), 'plantillas-cuenta:v1:u1');
    assert.notEqual(claveCachePlantillas('u1'), claveCachePlantillas('u2'));
  });

  it('un sobre del mismo usuario y esquema se lee', () => {
    const sobre = crearSobreCache('u1', [plantilla('p1')], new Date('2026-10-26T12:00:00Z'));
    assert.equal(sobre.sincronizadoEn, '2026-10-26T12:00:00.000Z');
    assert.deepEqual(plantillasDesdeSobre(sobre, 'u1')?.map((p) => p.id), ['p1']);
  });

  it('descarta el contenido de otro usuario', () => {
    const sobre = crearSobreCache('u1', [plantilla('p1')]);
    assert.equal(plantillasDesdeSobre(sobre, 'u2'), null);
  });

  it('descarta un esquema distinto y valores corruptos', () => {
    const sobre = { ...crearSobreCache('u1', [plantilla('p1')]), esquema: 2 };
    assert.equal(plantillasDesdeSobre(sobre, 'u1'), null);
    assert.equal(plantillasDesdeSobre(null, 'u1'), null);
    assert.equal(plantillasDesdeSobre('texto', 'u1'), null);
    assert.equal(plantillasDesdeSobre({ esquema: 1, usuarioId: 'u1', plantillas: 'no' }, 'u1'), null);
    assert.equal(plantillasDesdeSobre([plantilla('p1')], 'u1'), null);
  });

  it('ignora entradas con forma inválida dentro de un sobre válido', () => {
    const sobre = { ...crearSobreCache('u1', [plantilla('p1')]), plantillas: [plantilla('p1'), { id: 5 }, null] };
    assert.deepEqual(plantillasDesdeSobre(sobre, 'u1')?.map((p) => p.id), ['p1']);
  });

  it('ordena por actualizadoEn descendente y luego por id', () => {
    const lista = [
      plantilla('b', { actualizadoEn: '2026-10-26T10:00:00.000Z' }),
      plantilla('c', { actualizadoEn: '2026-10-26T11:00:00.000Z' }),
      plantilla('a', { actualizadoEn: '2026-10-26T10:00:00.000Z' }),
    ];
    assert.deepEqual(ordenarPlantillas(lista).map((p) => p.id), ['c', 'a', 'b']);
  });
});

describe('borrador sin conexión desde la caché', () => {
  it('vacía fechas y conserva solo contactos conocidos', () => {
    const borrador = construirBorradorDesdeCache(plantilla('p1'), ['c1', 'c3', 'otro']);
    assert.equal(borrador.horaInicio, null);
    assert.equal(borrador.horaRetornoEstimada, null);
    assert.equal(borrador.requiereFechasNuevas, true);
    assert.deepEqual(borrador.idsContactos, ['c1', 'c3']);
    assert.equal(borrador.cantidadContactosNoVigentes, 1);
    assert.equal(borrador.descripcionOrigen, 'Plantilla «Plantilla p1»');
  });

  it('no comparte referencias con la plantilla cacheada', () => {
    const p = plantilla('p1');
    const borrador = construirBorradorDesdeCache(p, ['c1']);
    borrador.nombresAcompanantes.push('Intruso');
    assert.deepEqual(p.nombresAcompanantes, ['Ana Torres']);
  });

  it('el mensaje avisa de contactos no vigentes solo cuando los hay', () => {
    const sin = construirBorradorDesdeCache(plantilla('p1'), ['c1', 'c2', 'c3']);
    assert.ok(!mensajeAplicacionBorrador(sin).includes('Aviso'));
    const con = construirBorradorDesdeCache(plantilla('p1'), ['c1']);
    assert.match(mensajeAplicacionBorrador(con), /2 contactos de la plantilla ya no están vigentes/);
  });
});
