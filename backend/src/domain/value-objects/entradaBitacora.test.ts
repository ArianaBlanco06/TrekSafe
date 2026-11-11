import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ESTADOS_INCIDENTE_CON_ESCRITURA,
  LIMITE_TEXTO_ENTRADA_BITACORA,
  TIPOS_ENTRADA_BITACORA,
  admiteEntradas,
} from './entradaBitacora.js';

const sql = readFileSync(new URL('../../../migrations/019_hu41_bitacora_incidente.sql', import.meta.url), 'utf8');

describe('HU-41: reglas de la bitácora del incidente', () => {
  it('abierto y localizado admiten entradas; cerrado no', () => {
    assert.equal(admiteEntradas('abierto'), true);
    assert.equal(admiteEntradas('localizado'), true);
    assert.equal(admiteEntradas('cerrado'), false);
  });

  it('los tipos coinciden con el CHECK de la migración 019', () => {
    const bloque = /chk_entradas_bitacora_tipo CHECK \(tipo IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const tiposSql = [...bloque.matchAll(/'([^']+)'/g)].map((c) => c[1]);
    assert.deepEqual(tiposSql, [...TIPOS_ENTRADA_BITACORA]);
  });

  it('el límite del texto coincide con la migración 019', () => {
    assert.equal(LIMITE_TEXTO_ENTRADA_BITACORA, 2000);
    assert.ok(sql.includes(`char_length(texto) BETWEEN 1 AND ${LIMITE_TEXTO_ENTRADA_BITACORA}`));
    assert.ok(sql.includes(`char_length(v_texto) NOT BETWEEN 1 AND ${LIMITE_TEXTO_ENTRADA_BITACORA}`));
  });

  it('el estado cerrado se rechaza en la RPC y los estados de escritura figuran en TS', () => {
    assert.deepEqual([...ESTADOS_INCIDENTE_CON_ESCRITURA], ['abierto', 'localizado']);
    assert.ok(sql.includes("v_inc.estado = 'cerrado'"));
    assert.ok(sql.includes("RAISE EXCEPTION 'INCIDENTE_CERRADO'"));
  });
});
