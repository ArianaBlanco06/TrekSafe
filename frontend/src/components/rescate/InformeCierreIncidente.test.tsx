import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { InformeCierreIncidente } from './InformeCierreIncidente';
import type { InformeCierreIncidente as DatosInforme } from '../../services/cierreIncidente';

const informe = (extra: Partial<DatosInforme> = {}): DatosInforme => ({
  id: 'i1', incidenteId: 'inc-1', expedicionId: 'exp-1', resultado: 'asistido_en_terreno', resumen: 'Atendida en el lugar',
  cerradoPor: { rescatistaId: 'a1', nombreRescatista: 'Ana Rescate', esMio: false }, cerradoEn: '2030-01-15T12:34:00.000Z',
  entradaBitacoraId: 'e1', tipoCierre: 'operativo', estadoExpedicion: 'alerta', retornoConfirmadoPorSenderista: false, ...extra,
});

function textoDe(arbol: ReactTestRenderer): string {
  const aplanar = (nodo: unknown): string => {
    if (nodo === null || nodo === undefined) return '';
    if (typeof nodo === 'string') return nodo;
    if (Array.isArray(nodo)) return nodo.map(aplanar).join('');
    return aplanar((nodo as { children?: unknown }).children);
  };
  return aplanar(arbol.toJSON());
}

async function montar(datos: DatosInforme) {
  let arbol!: ReactTestRenderer;
  await act(async () => {
    arbol = create(<InformeCierreIncidente informe={datos} zonaHoraria="UTC" />);
  });
  return arbol;
}

describe('InformeCierreIncidente (HU-42)', () => {
  it('muestra el título, el resultado con su etiqueta, el resumen, quién cerró y la fecha del servidor', async () => {
    const texto = textoDe(await montar(informe()));
    assert.match(texto, /Rescate cerrado \(cierre operativo\)/);
    assert.match(texto, /Asistido en terreno/);
    assert.match(texto, /Atendida en el lugar/);
    assert.match(texto, /Ana Rescate/);
    assert.match(texto, /15\/01\/2030 12:34/);
  });

  it('si el informe es mío dice "Tú"', async () => {
    const texto = textoDe(await montar(informe({ cerradoPor: { rescatistaId: 'a1', nombreRescatista: 'Ana Rescate', esMio: true } })));
    assert.match(texto, /Tú ·/);
    assert.doesNotMatch(texto, /Ana Rescate/);
  });

  it('CA-3: aclara que cerrar no confirma el retorno y muestra "Retorno aún no confirmado por el senderista"', async () => {
    const texto = textoDe(await montar(informe()));
    assert.match(texto, /Cerrar el rescate no confirma el retorno del senderista/);
    assert.match(texto, /Retorno aún no confirmado por el senderista/);
  });

  it('si el senderista ya confirmó su retorno lo indica', async () => {
    const texto = textoDe(await montar(informe({ retornoConfirmadoPorSenderista: true, estadoExpedicion: 'completada' })));
    assert.match(texto, /Retorno confirmado por el senderista/);
    assert.doesNotMatch(texto, /aún no confirmado/);
  });
});
