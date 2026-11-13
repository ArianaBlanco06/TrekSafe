import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crearGestorOperacion } from './coordinacionRescate';
import {
  ETIQUETAS_RESULTADO_RESCATE,
  LIMITE_RESUMEN_CIERRE,
  RESULTADOS_RESCATE,
  TEXTO_CIERRE_OPERATIVO,
  intentarCerrarIncidente,
  intentarMarcarLocalizado,
  textoRetorno,
  validarCierre,
} from './cierreIncidente';
import { ErrorClienteApi } from '../services/clienteApi';
import type { InformeCierreIncidente } from '../services/cierreIncidente';

const informe: InformeCierreIncidente = {
  id: 'i1', incidenteId: 'inc-1', expedicionId: 'exp-1', resultado: 'evacuado', resumen: 'Evacuada',
  cerradoPor: { rescatistaId: 'a1', nombreRescatista: 'Ana', esMio: true }, cerradoEn: '2030-01-15T12:00:00.000Z',
  entradaBitacoraId: 'e1', tipoCierre: 'operativo', estadoExpedicion: 'alerta', retornoConfirmadoPorSenderista: false,
};

const gestor = () => {
  let n = 0;
  return crearGestorOperacion(() => `cmd-${++n}`);
};

describe('lib/cierreIncidente (HU-42)', () => {
  it('el catálogo tiene una etiqueta por resultado y ninguno habla de salud', () => {
    for (const r of RESULTADOS_RESCATE) assert.ok(ETIQUETAS_RESULTADO_RESCATE[r].length > 0, r);
    assert.equal(RESULTADOS_RESCATE.length, 4);
    assert.ok(!RESULTADOS_RESCATE.some((r) => /fallec|lesion|herid/.test(r)));
  });

  it('validarCierre exige resultado del catálogo y resumen de 1 a 2000 caracteres tras recortar', () => {
    assert.equal(validarCierre({ resultado: '', resumen: 'x' }), 'Elige el resultado del rescate');
    assert.equal(validarCierre({ resultado: 'fallecido', resumen: 'x' }), 'Elige el resultado del rescate');
    assert.equal(validarCierre({ resultado: 'evacuado', resumen: '   ' }), 'El resumen no puede estar vacío');
    assert.equal(validarCierre({ resultado: 'evacuado', resumen: 'a'.repeat(LIMITE_RESUMEN_CIERRE + 1) }), 'Máximo 2000 caracteres');
    assert.equal(validarCierre({ resultado: 'evacuado', resumen: 'a'.repeat(LIMITE_RESUMEN_CIERRE) }), null);
    assert.equal(validarCierre({ resultado: 'falsa_alarma', resumen: '  ok  ' }), null);
  });

  it('el texto de retorno depende solo de retornoConfirmadoPorSenderista y la nota fija aclara que el cierre no lo confirma', () => {
    assert.equal(textoRetorno({ retornoConfirmadoPorSenderista: false }), 'Retorno aún no confirmado por el senderista');
    assert.equal(textoRetorno({ retornoConfirmadoPorSenderista: true }), 'Retorno confirmado por el senderista');
    assert.match(TEXTO_CIERRE_OPERATIVO, /no confirma el retorno del senderista/);
  });

  it('intentarCerrarIncidente: éxito envía {comandoId, resultado, resumen} y descarta el comandoId', async () => {
    const g = gestor();
    const llamadas: unknown[] = [];
    const r = await intentarCerrarIncidente('inc-1', g, async (id, datos) => {
      llamadas.push([id, datos]);
      return { cierre: informe };
    }, { resultado: 'evacuado', resumen: 'Evacuada' });
    assert.deepEqual(r, { tipo: 'cerrado', informe });
    assert.deepEqual(llamadas, [['inc-1', { comandoId: 'cmd-1', resultado: 'evacuado', resumen: 'Evacuada' }]]);
    assert.equal(g.obtener(), 'cmd-2'); // descartado: el siguiente intento usa otro
  });

  it('intentarCerrarIncidente: 403 NO_ES_RESPONSABLE, 409 NO_LOCALIZADO y 409 CERRADO son definitivos y descartan el comandoId', async () => {
    const casos: [ErrorClienteApi, unknown][] = [
      [new ErrorClienteApi('x', 403, 'NO_ES_RESPONSABLE', undefined, { responsableVigente: { responsableId: 'b', nombreResponsable: 'Beto' } }),
        { tipo: 'no_responsable', responsable: { responsableId: 'b', nombreResponsable: 'Beto' } }],
      [new ErrorClienteApi('x', 403, 'NO_ES_RESPONSABLE'), { tipo: 'no_responsable', responsable: null }],
      [new ErrorClienteApi('x', 409, 'INCIDENTE_NO_LOCALIZADO'), { tipo: 'no_localizado' }],
      [new ErrorClienteApi('x', 409, 'INCIDENTE_CERRADO'), { tipo: 'ya_cerrado' }],
    ];
    for (const [error, esperado] of casos) {
      const g = gestor();
      const r = await intentarCerrarIncidente('inc-1', g, async () => { throw error; }, { resultado: 'evacuado', resumen: 'x' });
      assert.deepEqual(r, esperado);
      assert.equal(g.obtener(), 'cmd-2');
    }
  });

  it('intentarCerrarIncidente: un error de red o 5xx conserva el comandoId (incierto); un 400 lo descarta', async () => {
    for (const status of [0, 500, 503]) {
      const g = gestor();
      const r = await intentarCerrarIncidente('inc-1', g, async () => { throw new ErrorClienteApi('caído', status); }, { resultado: 'evacuado', resumen: 'x' });
      assert.deepEqual(r, { tipo: 'error', mensaje: 'caído', incierto: true });
      assert.equal(g.obtener(), 'cmd-1', `status ${status}`);
    }
    const g = gestor();
    const r = await intentarCerrarIncidente('inc-1', g, async () => { throw new ErrorClienteApi('inválido', 400, 'ErrorValidacion'); }, { resultado: 'evacuado', resumen: 'x' });
    assert.deepEqual(r, { tipo: 'error', mensaje: 'inválido', incierto: false });
    assert.equal(g.obtener(), 'cmd-2');
  });

  it('intentarMarcarLocalizado: éxito, no responsable, cerrado, incierto y 400 con la misma política', async () => {
    const incidente = { incidenteId: 'inc-1', expedicionId: 'exp-1', estado: 'localizado' as const, version: 2, responsable: { responsableId: 'a1', nombreResponsable: 'Ana' } };
    let g = gestor();
    const llamadas: unknown[] = [];
    assert.deepEqual(await intentarMarcarLocalizado('inc-1', g, async (id, datos) => { llamadas.push([id, datos]); return { incidente, repetido: false }; }), { tipo: 'localizado', incidente });
    assert.deepEqual(llamadas, [['inc-1', { operacionId: 'cmd-1' }]]);
    assert.equal(g.obtener(), 'cmd-2');

    g = gestor();
    assert.deepEqual(await intentarMarcarLocalizado('inc-1', g, async () => { throw new ErrorClienteApi('x', 403, 'NO_ES_RESPONSABLE'); }), { tipo: 'no_responsable', responsable: null });
    g = gestor();
    assert.deepEqual(await intentarMarcarLocalizado('inc-1', g, async () => { throw new ErrorClienteApi('x', 409, 'INCIDENTE_CERRADO'); }), { tipo: 'cerrado' });
    g = gestor();
    assert.deepEqual(await intentarMarcarLocalizado('inc-1', g, async () => { throw new ErrorClienteApi('red', 0); }), { tipo: 'error', mensaje: 'red', incierto: true });
    assert.equal(g.obtener(), 'cmd-1');
    g = gestor();
    assert.deepEqual(await intentarMarcarLocalizado('inc-1', g, async () => { throw new ErrorClienteApi('mal', 400); }), { tipo: 'error', mensaje: 'mal', incierto: false });
    assert.equal(g.obtener(), 'cmd-2');
  });
});
