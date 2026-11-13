import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { ComandoCerrarIncidente } from './ComandoCerrarIncidente.js';

const RESCATISTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMANDO = '11111111-1111-4111-8111-111111111111';

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  comandoId: COMANDO, resultado: 'evacuado', resumen: 'Evacuada al refugio', ...extra,
});

describe('ComandoCerrarIncidente', () => {
  it('se crea con identidad y parámetros válidos; el resumen se recorta y comandoId es también operacionId', () => {
    const c = ComandoCerrarIncidente.crear(RESCATISTA, INCIDENTE, cuerpo({ resumen: '  Evacuada  ' }));
    assert.equal(c.comandoId, COMANDO);
    assert.equal(c.operacionId, COMANDO);
    assert.equal(c.incidenteId, INCIDENTE);
    assert.equal(c.rescatistaId, RESCATISTA);
    assert.equal(c.resultado, 'evacuado');
    assert.equal(c.resumen, 'Evacuada');
  });

  it('es inmutable', () => {
    const c = ComandoCerrarIncidente.crear(RESCATISTA, INCIDENTE, cuerpo());
    assert.equal(Object.isFrozen(c), true);
    assert.throws(() => {
      (c as { resumen: string }).resumen = 'otro';
    }, TypeError);
    assert.throws(() => {
      (c as unknown as Record<string, unknown>).otro = 1;
    }, TypeError);
  });

  it('acepta cada resultado del catálogo y exactamente 2000 caracteres', () => {
    for (const resultado of ['localizado_sin_asistencia', 'asistido_en_terreno', 'evacuado', 'falsa_alarma']) {
      assert.equal(ComandoCerrarIncidente.crear(RESCATISTA, INCIDENTE, cuerpo({ resultado })).resultado, resultado);
    }
    assert.equal(ComandoCerrarIncidente.crear(RESCATISTA, INCIDENTE, cuerpo({ resumen: 'a'.repeat(2000) })).resumen.length, 2000);
  });

  it('rechaza con ZodError: cuerpo vacío o que no es objeto, UUID inválido, resultado fuera del catálogo, resumen vacío, en blanco o de 2001', () => {
    const invalidos: unknown[] = [
      undefined, null, 'texto', 7, [], {},
      { resultado: 'evacuado', resumen: 'x' },
      { comandoId: COMANDO, resumen: 'x' },
      { comandoId: COMANDO, resultado: 'evacuado' },
      cuerpo({ comandoId: 'no-es-uuid' }),
      cuerpo({ resultado: 'fallecido' }),
      cuerpo({ resultado: 'con_lesiones' }),
      cuerpo({ resultado: '' }),
      cuerpo({ resultado: 5 }),
      cuerpo({ resumen: '' }),
      cuerpo({ resumen: '   ' }),
      cuerpo({ resumen: 'a'.repeat(2001) }),
      cuerpo({ resumen: 5 }),
    ];
    for (const c of invalidos) {
      assert.throws(() => ComandoCerrarIncidente.crear(RESCATISTA, INCIDENTE, c), ZodError, JSON.stringify(c));
    }
  });

  it('el rescatista sale del JWT y el cierre no confirma el retorno: claves extra dan ZodError', () => {
    const extras = [
      { rescatistaId: '99999999-9999-4999-8999-999999999999' },
      { estadoExpedicion: 'completada' },
      { confirmarRetorno: true },
      { cerradoEn: '2000-01-01' },
    ];
    for (const extra of extras) {
      assert.throws(() => ComandoCerrarIncidente.crear(RESCATISTA, INCIDENTE, cuerpo(extra)), ZodError);
    }
  });

  it('rechaza con ZodError un incidente o un rescatista que no son UUID', () => {
    assert.throws(() => ComandoCerrarIncidente.crear(RESCATISTA, 'no-es-uuid', cuerpo()), ZodError);
    assert.throws(() => ComandoCerrarIncidente.crear('no-es-uuid', INCIDENTE, cuerpo()), ZodError);
  });
});
