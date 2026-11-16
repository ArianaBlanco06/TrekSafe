import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ESTADOS_INCIDENTE_CERRABLES,
  ESTADOS_INCIDENTE_LOCALIZABLES,
  LIMITE_RESUMEN_CIERRE,
  RESULTADOS_RESCATE,
  TEXTO_ENTRADA_LOCALIZADO,
  admiteCierre,
  admiteLocalizar,
} from './cierreIncidente.js';

const sql = readFileSync(new URL('../../../migrations/025_hu42_cerrar_incidente.sql', import.meta.url), 'utf8');

describe('HU-42: reglas del cierre del incidente', () => {
  it('solo un incidente localizado se cierra; solo uno abierto se marca como localizado', () => {
    assert.equal(admiteCierre('localizado'), true);
    assert.equal(admiteCierre('abierto'), false);
    assert.equal(admiteCierre('cerrado'), false);
    assert.equal(admiteLocalizar('abierto'), true);
    assert.equal(admiteLocalizar('localizado'), false);
    assert.equal(admiteLocalizar('cerrado'), false);
    assert.deepEqual([...ESTADOS_INCIDENTE_CERRABLES], ['localizado']);
    assert.deepEqual([...ESTADOS_INCIDENTE_LOCALIZABLES], ['abierto']);
  });

  it('el catálogo de resultados coincide con el CHECK y con la validación de la RPC (025) y no incluye estado de salud', () => {
    const check = /chk_informes_cierre_resultado CHECK \(resultado IN\s*\(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const enCheck = [...check.matchAll(/'([^']+)'/g)].map((c) => c[1]);
    assert.deepEqual(enCheck, [...RESULTADOS_RESCATE]);
    const rpc = /p_resultado NOT IN \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const enRpc = [...rpc.matchAll(/'([^']+)'/g)].map((c) => c[1]);
    assert.deepEqual(enRpc, [...RESULTADOS_RESCATE]);
    for (const medico of ['fallecido', 'con_lesiones', 'herido', 'lesion']) {
      assert.ok(!RESULTADOS_RESCATE.some((r) => r.includes(medico)), medico);
    }
  });

  it('el límite del resumen es 2000 en el CHECK y en la RPC', () => {
    assert.equal(LIMITE_RESUMEN_CIERRE, 2000);
    assert.ok(sql.includes(`char_length(resumen) BETWEEN 1 AND ${LIMITE_RESUMEN_CIERRE}`));
    assert.ok(sql.includes(`char_length(v_resumen) NOT BETWEEN 1 AND ${LIMITE_RESUMEN_CIERRE}`));
  });

  it("la RPC exige 'localizado' para cerrar y 'abierto' para localizar, y su nota fija coincide", () => {
    assert.ok(sql.includes("v_inc.estado <> 'localizado'"));
    assert.ok(sql.includes("SET estado = 'localizado'"));
    assert.ok(sql.includes(`c_texto CONSTANT TEXT := '${TEXTO_ENTRADA_LOCALIZADO}'`));
  });

  it('la 025 no modifica expediciones, no hace REVOKE sobre incidentes y no crea FK hacia la bitácora', () => {
    const sinComentarios = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    assert.ok(!/UPDATE\s+public\.expediciones/i.test(sinComentarios));
    assert.ok(!/UPDATE\s+expediciones/i.test(sinComentarios));
    assert.ok(!/ALTER\s+TABLE\s+public\.expediciones/i.test(sinComentarios));
    assert.ok(!/REVOKE[^;]*ON\s+public\.incidentes\b/i.test(sinComentarios));
    assert.ok(!/REFERENCES\s+public\.entradas_bitacora_incidente/i.test(sinComentarios));
  });
});
