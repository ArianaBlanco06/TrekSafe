import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TIPOS_EVENTO_PLAN, esTipoEventoPlan } from './tiposEventoPlan.js';

describe('HU-36: tipos de evento del plan', () => {
  it('reconoce solo los tipos conocidos', () => {
    for (const tipo of TIPOS_EVENTO_PLAN) assert.equal(esTipoEventoPlan(tipo), true);
    for (const valor of ['editada', 'DESCONOCIDO', '', null, undefined, 1, {}, ['EDITADA']]) {
      assert.equal(esTipoEventoPlan(valor), false);
    }
  });

  it('coincide con la restricción tipo IN (...) de la migración 002', () => {
    const sql = readFileSync(new URL('../../../migrations/002_hu26_version_y_eventos_plan.sql', import.meta.url), 'utf8');
    const bloque = /tipo\s+IN\s*\(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const tiposSql = [...bloque.matchAll(/'([^']+)'/g)].map((coincidencia) => coincidencia[1]);
    assert.deepEqual(tiposSql, [...TIPOS_EVENTO_PLAN]);
  });
});
