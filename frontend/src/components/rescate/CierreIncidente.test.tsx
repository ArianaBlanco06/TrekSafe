import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CierreIncidente, type CierreIncidenteProps } from './CierreIncidente';
import { ErrorClienteApi } from '../../services/clienteApi';
import type { DatosCierreIncidente, InformeCierreIncidente } from '../../services/cierreIncidente';

const informe: InformeCierreIncidente = {
  id: 'i1', incidenteId: 'inc-1', expedicionId: 'exp-1', resultado: 'evacuado', resumen: 'Evacuada',
  cerradoPor: { rescatistaId: 'a1', nombreRescatista: 'Ana', esMio: true }, cerradoEn: '2030-01-15T12:00:00.000Z',
  entradaBitacoraId: 'e1', tipoCierre: 'operativo', estadoExpedicion: 'alerta', retornoConfirmadoPorSenderista: false,
};
const incidente = { incidenteId: 'inc-1', expedicionId: 'exp-1', estado: 'localizado' as const, version: 2, responsable: { responsableId: 'a1', nombreResponsable: 'Ana' } };

function textoDe(arbol: ReactTestRenderer): string {
  const aplanar = (nodo: unknown): string => {
    if (nodo === null || nodo === undefined) return '';
    if (typeof nodo === 'string') return nodo;
    if (Array.isArray(nodo)) return nodo.map(aplanar).join('');
    return aplanar((nodo as { children?: unknown }).children);
  };
  return aplanar(arbol.toJSON());
}

const botones = (arbol: ReactTestRenderer, texto: string) =>
  arbol.root.findAllByType('button').filter((b) => b.children.join('') === texto);
const boton = (arbol: ReactTestRenderer, texto: string) => botones(arbol, texto)[0];
const pulsar = (arbol: ReactTestRenderer, texto: string) =>
  act(async () => {
    boton(arbol, texto)!.props.onClick();
  });
const select = (arbol: ReactTestRenderer) => arbol.root.findAllByType('select')[0];
const textarea = (arbol: ReactTestRenderer) => arbol.root.findAllByType('textarea')[0];
const elegir = (arbol: ReactTestRenderer, resultado: string, resumen: string) =>
  act(async () => {
    select(arbol)!.props.onChange({ target: { value: resultado } });
    textarea(arbol)!.props.onChange({ target: { value: resumen } });
  });

async function montar(props: Partial<CierreIncidenteProps> = {}) {
  const cambios = { n: 0 };
  let arbol!: ReactTestRenderer;
  await act(async () => {
    arbol = create(
      <CierreIncidente
        incidenteId="inc-1"
        estado="localizado"
        esResponsable
        nombreResponsable="Ana"
        generarId={(() => {
          let n = 0;
          return () => `cmd-${++n}`;
        })()}
        alCambiar={() => void (cambios.n += 1)}
        {...props}
      />,
    );
  });
  return { arbol, cambios };
}

describe('CierreIncidente (HU-42)', () => {
  it('con el incidente abierto y el responsable: solo el botón "Marcar persona localizada", sin formulario de cierre', async () => {
    const { arbol } = await montar({ estado: 'abierto' });
    assert.ok(boton(arbol, 'Marcar persona localizada'));
    assert.equal(arbol.root.findAllByType('select').length, 0);
    assert.equal(arbol.root.findAllByType('textarea').length, 0);
  });

  it('marcar localizada pide confirmación en dos pasos y llama una vez con el operacionId', async () => {
    const llamadas: unknown[] = [];
    const { arbol, cambios } = await montar({
      estado: 'abierto',
      marcarLocalizado: async (id, datos) => {
        llamadas.push([id, datos]);
        return { incidente, repetido: false };
      },
    });
    await pulsar(arbol, 'Marcar persona localizada');
    assert.deepEqual(llamadas, []); // primer paso: no envía
    assert.match(textoDe(arbol), /¿Confirmas que la persona fue localizada\?/);
    await pulsar(arbol, 'Confirmar localización');
    assert.deepEqual(llamadas, [['inc-1', { operacionId: 'cmd-1' }]]);
    assert.equal(cambios.n, 1);
    assert.match(textoDe(arbol), /Persona marcada como localizada/);
  });

  it('con el incidente localizado: formulario con select sin valor preseleccionado, contador, aviso de privacidad y nota del cierre operativo', async () => {
    const { arbol } = await montar();
    assert.equal(select(arbol)!.props.value, '');
    const opciones = select(arbol)!.findAllByType('option');
    assert.equal(opciones.length, 5);
    assert.equal(opciones[0]!.props.value, '');
    assert.equal(textarea(arbol)!.props.maxLength, 2000);
    assert.match(textoDe(arbol), /0\/2000/);
    const notas = arbol.root.findAll((n) => n.props.role === 'note').map((n) => n.children.join(''));
    assert.ok(notas.some((t) => /No registres datos médicos/.test(t)));
    assert.ok(notas.some((t) => /no confirma el retorno del senderista/.test(t)));
    assert.equal(arbol.root.findAllByType('button').filter((b) => b.children.join('') === 'Marcar persona localizada').length, 0);
    await elegir(arbol, 'evacuado', 'Hola');
    assert.match(textoDe(arbol), /4\/2000/);
  });

  it('un no responsable ve solo el texto de solo lectura con el nombre del responsable', async () => {
    const { arbol } = await montar({ esResponsable: false, nombreResponsable: 'Beto Rescate' });
    assert.match(textoDe(arbol), /Solo Beto Rescate \(responsable vigente\) puede cerrar el incidente\./);
    assert.equal(arbol.root.findAllByType('button').length, 0);
    assert.equal(arbol.root.findAllByType('select').length, 0);
  });

  it('un incidente cerrado no renderiza nada', async () => {
    const { arbol } = await montar({ estado: 'cerrado' });
    assert.equal(arbol.toJSON(), null);
  });

  it('sin resultado o sin resumen no se pide confirmación y se muestra el error', async () => {
    const { arbol } = await montar();
    await pulsar(arbol, 'Cerrar incidente');
    assert.match(textoDe(arbol), /Elige el resultado del rescate/);
    await elegir(arbol, 'evacuado', '   ');
    await pulsar(arbol, 'Cerrar incidente');
    assert.match(textoDe(arbol), /El resumen no puede estar vacío/);
    assert.equal(botones(arbol, 'Confirmar cierre').length, 0);
  });

  it('cerrar pide confirmación en dos pasos y envía una sola llamada con {comandoId, resultado, resumen recortado}', async () => {
    const llamadas: [string, DatosCierreIncidente][] = [];
    const { arbol, cambios } = await montar({
      cerrar: async (id, datos) => {
        llamadas.push([id, datos]);
        return { cierre: informe };
      },
    });
    await elegir(arbol, 'asistido_en_terreno', '  Atendida en el lugar  ');
    await pulsar(arbol, 'Cerrar incidente');
    assert.equal(llamadas.length, 0);
    assert.ok(boton(arbol, 'Confirmar cierre'));
    assert.equal(textarea(arbol)!.props.readOnly, true);
    await pulsar(arbol, 'Confirmar cierre');
    assert.deepEqual(llamadas, [['inc-1', { comandoId: 'cmd-1', resultado: 'asistido_en_terreno', resumen: 'Atendida en el lugar' }]]);
    assert.equal(cambios.n, 1);
    assert.match(textoDe(arbol), /Incidente cerrado/);
  });

  it('"Cancelar" en la confirmación vuelve al formulario sin enviar', async () => {
    let llamadas = 0;
    const { arbol } = await montar({ cerrar: async () => { llamadas += 1; return { cierre: informe }; } });
    await elegir(arbol, 'evacuado', 'Resumen');
    await pulsar(arbol, 'Cerrar incidente');
    await pulsar(arbol, 'Cancelar');
    assert.ok(boton(arbol, 'Cerrar incidente'));
    assert.equal(llamadas, 0);
  });

  it('error sin respuesta: formulario de solo lectura, "Reintentar" reutiliza el mismo comandoId y "Descartar" usa uno nuevo', async () => {
    const usados: string[] = [];
    let intento = 0;
    const { arbol, cambios } = await montar({
      cerrar: async (_id, datos) => {
        usados.push(datos.comandoId);
        intento += 1;
        if (intento <= 2) throw new ErrorClienteApi('No se pudo conectar con el servidor.', 0);
        return { cierre: informe };
      },
    });
    await elegir(arbol, 'evacuado', 'Resumen');
    await pulsar(arbol, 'Cerrar incidente');
    await pulsar(arbol, 'Confirmar cierre');
    assert.match(textoDe(arbol), /No se pudo conectar con el servidor\./);
    assert.equal(textarea(arbol)!.props.readOnly, true);
    assert.equal(select(arbol)!.props.disabled, true);

    await pulsar(arbol, 'Reintentar');
    assert.deepEqual(usados, ['cmd-1', 'cmd-1']);

    await pulsar(arbol, 'Descartar');
    assert.equal(cambios.n, 1); // vuelve a leer por si sí se guardó
    assert.equal(textarea(arbol)!.props.readOnly, false);
    await pulsar(arbol, 'Cerrar incidente');
    await pulsar(arbol, 'Confirmar cierre');
    assert.deepEqual(usados, ['cmd-1', 'cmd-1', 'cmd-2']);
  });

  it('403 NO_ES_RESPONSABLE, 409 NO_LOCALIZADO y 409 CERRADO avisan y piden recargar la página', async () => {
    const casos: [ErrorClienteApi, RegExp][] = [
      [new ErrorClienteApi('x', 403, 'NO_ES_RESPONSABLE', undefined, { responsableVigente: { responsableId: 'b', nombreResponsable: 'Beto' } }), /Ahora coordina Beto; ya no puedes cerrar el incidente\./],
      [new ErrorClienteApi('x', 409, 'INCIDENTE_NO_LOCALIZADO'), /aún no está marcado como localizado/],
      [new ErrorClienteApi('x', 409, 'INCIDENTE_CERRADO'), /ya estaba cerrado/],
    ];
    for (const [error, esperado] of casos) {
      const { arbol, cambios } = await montar({ cerrar: async () => { throw error; } });
      await elegir(arbol, 'evacuado', 'Resumen');
      await pulsar(arbol, 'Cerrar incidente');
      await pulsar(arbol, 'Confirmar cierre');
      assert.match(textoDe(arbol), esperado);
      assert.equal(cambios.n, 1);
    }
  });
});
