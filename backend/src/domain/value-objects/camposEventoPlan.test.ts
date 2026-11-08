import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CAMPOS_EVENTO_PLAN, esEventoAnonimizado, sanearCambios } from './camposEventoPlan.js';

function constanteFrontend(nombre: string): string[] {
  const fuente = readFileSync(new URL('../../../../frontend/src/services/historialCambios.ts', import.meta.url), 'utf8');
  const bloque = new RegExp(`export const ${nombre} = \\[([^\\]]*)\\] as const`).exec(fuente)?.[1] ?? '';
  return [...bloque.matchAll(/'([^']+)'/g)].map((coincidencia) => coincidencia[1]);
}

describe('HU-36 CA-03: lista blanca de cambios del plan', () => {
  it('conserva solo los campos conocidos con forma antes/después', () => {
    const saneados = sanearCambios({
      lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca', contrasena: 'secreta' },
      coordenadasInicio: { antes: null, despues: '-9.04500, -77.60800' },
      minutosTolerancia: { antes: 30, despues: 45 },
      idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] },
      estado: { antes: 'programada', despues: 'cancelada' },
      hashContrasena: { antes: 'x', despues: 'y' },
      fichaMedica: { antes: 'alergia', despues: 'otra' },
      operacionId: { antes: 'a', despues: 'b' },
    });
    assert.deepEqual(saneados, {
      lugarFin: { antes: 'Laguna 69', despues: 'Nevado Ishinca' },
      coordenadasInicio: { antes: null, despues: '-9.04500, -77.60800' },
      minutosTolerancia: { antes: 30, despues: 45 },
      idsContactos: { antes: ['c1'], despues: ['c1', 'c2'] },
      estado: { antes: 'programada', despues: 'cancelada' },
    });
  });

  it('devuelve un objeto vacío si la entrada no es un objeto', () => {
    for (const crudo of [null, undefined, 'texto', 3, [], [{ lugarFin: { antes: 'a', despues: 'b' } }]]) {
      assert.deepEqual(sanearCambios(crudo), {});
    }
  });

  it('descarta valores sin la forma esperada o con tipos no admitidos', () => {
    assert.deepEqual(sanearCambios({
      lugarFin: 'Laguna 69',
      lugarInicio: { otra: 1 },
      horaInicio: { antes: { anidado: true }, despues: '2026-11-15T12:00:00Z' },
      nombresAcompanantes: { antes: [1, 2], despues: [] },
      minutosTolerancia: { antes: Number.NaN, despues: 30 },
      horaRetornoEstimada: { despues: '2026-11-15T18:00:00Z' },
    }), { horaRetornoEstimada: { antes: null, despues: '2026-11-15T18:00:00Z' } });
  });

  it('no comparte referencias con la entrada', () => {
    const crudo = { idsContactos: { antes: ['c1'], despues: ['c2'] } };
    const saneados = sanearCambios(crudo);
    crudo.idsContactos.antes.push('c3');
    assert.deepEqual(saneados.idsContactos?.antes, ['c1']);
  });

  it('anonimizado solo con cambios crudos vacíos y sin motivo', () => {
    assert.equal(esEventoAnonimizado({}, null), true);
    assert.equal(esEventoAnonimizado({}, 'Mal clima'), false);
    assert.equal(esEventoAnonimizado({ lugarFin: { antes: true, despues: {} } }, null), false);
    for (const crudo of [null, undefined, 'texto', 0, [], [{}]]) assert.equal(esEventoAnonimizado(crudo, null), false);
  });

  it('coincide con CAMPOS_CAMBIO_PLAN del frontend', () => {
    assert.deepEqual(constanteFrontend('CAMPOS_CAMBIO_PLAN'), [...CAMPOS_EVENTO_PLAN]);
  });

  it('coincide con la lista blanca de la migración 012', () => {
    const sql = readFileSync(new URL('../../../migrations/012_hu36_eventos_plan_solo_anexado.sql', import.meta.url), 'utf8');
    const bloque = /WHERE e\.key IN \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const camposSql = [...bloque.matchAll(/'([^']+)'/g)].map((coincidencia) => coincidencia[1]);
    assert.deepEqual(camposSql, [...CAMPOS_EVENTO_PLAN]);
  });
});
