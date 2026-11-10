import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BloqueCoordinacion, type BloqueCoordinacionProps } from './BloqueCoordinacion';
import type { Coordinacion, RelevoPendiente } from '../../services/rescate';
import { ErrorClienteApi } from '../../services/clienteApi';

const relevoPendiente = (extra: Partial<RelevoPendiente> = {}): RelevoPendiente => ({
  relevoId: 'rel-1',
  destinatarioId: 'dest-1',
  nombreDestinatario: 'Luis Relevo',
  solicitadoEn: '2030-01-15T14:00:00.000Z',
  esParaMi: false,
  ...extra,
});

const coordinacion = (extra: Partial<Coordinacion> = {}): Coordinacion => ({
  incidenteId: 'inc-1',
  version: 4,
  responsableId: 'resp-1',
  nombreResponsable: 'Ana Rescate',
  asumidoEn: '2030-01-15T12:05:00.000Z',
  esMia: false,
  ...extra,
});

const RESCATISTAS = [
  { id: 'dest-1', nombreCompleto: 'Luis Relevo' },
  { id: 'dest-2', nombreCompleto: 'Marta Relevo' },
];

function textoDe(arbol: ReactTestRenderer): string {
  const aplanar = (nodo: unknown): string => {
    if (nodo === null || nodo === undefined) return '';
    if (typeof nodo === 'string') return nodo;
    if (Array.isArray(nodo)) return nodo.map(aplanar).join(' ');
    return aplanar((nodo as { children?: unknown }).children);
  };
  return aplanar(arbol.toJSON());
}

const botones = (arbol: ReactTestRenderer) => arbol.root.findAllByType('button').map((b) => b.children.join(''));
const botonCon = (arbol: ReactTestRenderer, texto: string) =>
  arbol.root.findAllByType('button').find((b) => b.children.join('') === texto)!;

async function montar(props: Partial<BloqueCoordinacionProps> = {}) {
  let arbol!: ReactTestRenderer;
  const actualizaciones = { n: 0 };
  await act(async () => {
    arbol = create(
      <BloqueCoordinacion
        expedicionId="exp-1"
        estado="alerta"
        coordinacion={coordinacion({ esMia: true })}
        alActualizar={() => void (actualizaciones.n += 1)}
        generarId={(() => {
          let n = 0;
          return () => `op-${++n}`;
        })()}
        relevo={{ listarRescatistas: async () => ({ rescatistas: RESCATISTAS }) }}
        {...props}
      />,
    );
  });
  return { arbol, actualizaciones };
}

const pulsar = (arbol: ReactTestRenderer, texto: string) =>
  act(async () => {
    botonCon(arbol, texto).props.onClick();
  });

async function completarFormulario(arbol: ReactTestRenderer, destinatario = 'dest-1', motivo = 'Cambio de turno') {
  await act(async () => {
    arbol.root.findByType('select').props.onChange({ target: { value: destinatario } });
    arbol.root.findByType('textarea').props.onChange({ target: { value: motivo } });
  });
}

describe('BloqueRelevo (HU-40): responsable', () => {
  it('el responsable sin relevo ve "Transferir coordinación" y ningún texto de relevo', async () => {
    const { arbol } = await montar();
    assert.deepEqual(botones(arbol), ['Transferir coordinación']);
    assert.doesNotMatch(textoDe(arbol), /Relevo pendiente/);
  });

  it('quien no es responsable ni destinatario no ve botones de relevo', async () => {
    const { arbol } = await montar({ coordinacion: coordinacion() });
    assert.deepEqual(botones(arbol), []);
  });

  it('el formulario carga los rescatistas, avisa de no incluir datos médicos y limita el motivo a 280', async () => {
    const { arbol } = await montar();
    await pulsar(arbol, 'Transferir coordinación');
    const opciones = arbol.root.findAllByType('option').map((o) => o.children.join(''));
    assert.deepEqual(opciones, ['Elige un rescatista…', 'Luis Relevo', 'Marta Relevo']);
    assert.match(textoDe(arbol), /No incluyas datos médicos/);
    assert.equal(arbol.root.findByType('textarea').props.maxLength, 280);
  });

  it('confirma con destinatario, motivo y la versión de la coordinación; muestra el relevo pendiente y actualiza', async () => {
    const llamadas: unknown[][] = [];
    const { arbol, actualizaciones } = await montar({
      relevo: {
        listarRescatistas: async () => ({ rescatistas: RESCATISTAS }),
        proponer: async (...args) => {
          llamadas.push(args);
          return { coordinacion: coordinacion({ esMia: true, relevoPendiente: relevoPendiente({ motivo: 'Cambio de turno' }) }) };
        },
      },
    });
    await pulsar(arbol, 'Transferir coordinación');
    await completarFormulario(arbol);
    await pulsar(arbol, 'Confirmar transferencia');

    assert.deepEqual(llamadas, [['exp-1', { destinatarioId: 'dest-1', motivo: 'Cambio de turno', versionIncidente: 4 }, 'op-1']]);
    assert.match(textoDe(arbol), /Relevo pendiente a Luis Relevo desde \d{2}:\d{2}\. Sigues coordinando tú/);
    assert.deepEqual(botones(arbol), []);
    assert.equal(actualizaciones.n, 1);
  });

  it('no envía sin destinatario o sin motivo', async () => {
    let enviadas = 0;
    const { arbol } = await montar({
      relevo: {
        listarRescatistas: async () => ({ rescatistas: RESCATISTAS }),
        proponer: async () => void (enviadas += 1) as never,
      },
    });
    await pulsar(arbol, 'Transferir coordinación');
    await pulsar(arbol, 'Confirmar transferencia');
    assert.match(textoDe(arbol), /Elige a quién/);
    await completarFormulario(arbol, 'dest-1', '   ');
    await pulsar(arbol, 'Confirmar transferencia');
    assert.match(textoDe(arbol), /motivo/);
    assert.equal(enviadas, 0);
  });

  it('un error de red conserva el operacionId; cambiar el motivo genera otro', async () => {
    const usados: string[] = [];
    const { arbol } = await montar({
      relevo: {
        listarRescatistas: async () => ({ rescatistas: RESCATISTAS }),
        proponer: async (_e, _d, operacion) => {
          usados.push(operacion);
          throw new ErrorClienteApi('No se pudo conectar con el servidor.', 0);
        },
      },
    });
    await pulsar(arbol, 'Transferir coordinación');
    await completarFormulario(arbol);
    await pulsar(arbol, 'Confirmar transferencia');
    await pulsar(arbol, 'Confirmar transferencia');
    await completarFormulario(arbol, 'dest-1', 'Otro motivo');
    await pulsar(arbol, 'Confirmar transferencia');
    assert.deepEqual(usados, ['op-1', 'op-1', 'op-2']);
    assert.match(textoDe(arbol), /No se pudo conectar/);
  });

  it('VERSION_DESACTUALIZADA muestra el motivo, cierra el formulario y relee la pantalla', async () => {
    const { arbol, actualizaciones } = await montar({
      relevo: {
        listarRescatistas: async () => ({ rescatistas: RESCATISTAS }),
        proponer: async () => {
          throw new ErrorClienteApi('La coordinación cambió. Revisa y vuelve a intentar.', 409, 'VERSION_DESACTUALIZADA', undefined, {
            versionActual: 5,
          });
        },
      },
    });
    await pulsar(arbol, 'Transferir coordinación');
    await completarFormulario(arbol);
    await pulsar(arbol, 'Confirmar transferencia');
    assert.match(textoDe(arbol), /La coordinación cambió/);
    assert.equal(arbol.root.findAllByType('textarea').length, 0);
    assert.equal(actualizaciones.n, 1);
  });

  it('con relevo pendiente propio no ofrece transferir de nuevo', async () => {
    const { arbol } = await montar({ coordinacion: coordinacion({ esMia: true, relevoPendiente: relevoPendiente() }) });
    assert.deepEqual(botones(arbol), []);
    assert.match(textoDe(arbol), /Sigues coordinando tú/);
  });
});

describe('BloqueRelevo (HU-40): destinatario y otros', () => {
  const paraMi = () => coordinacion({ relevoPendiente: relevoPendiente({ esParaMi: true, motivo: 'Cambio de turno' }) });

  it('el destinatario ve quién propone y el motivo, con "Aceptar relevo"', async () => {
    const { arbol } = await montar({ coordinacion: paraMi() });
    assert.match(textoDe(arbol), /Ana Rescate te propone relevarlo: Cambio de turno/);
    assert.deepEqual(botones(arbol), ['Aceptar relevo']);
  });

  it('aceptar envía el relevo y la operación, se deshabilita al enviar y relee la pantalla', async () => {
    let resolver!: (v: { coordinacion: Coordinacion }) => void;
    const llamadas: unknown[][] = [];
    const { arbol, actualizaciones } = await montar({
      coordinacion: paraMi(),
      relevo: {
        aceptar: (...args) => {
          llamadas.push(args);
          return new Promise((resuelve) => void (resolver = resuelve));
        },
      },
    });
    await pulsar(arbol, 'Aceptar relevo');
    assert.equal(botonCon(arbol, 'Aceptando…').props.disabled, true);
    await pulsar(arbol, 'Aceptando…'); // segundo clic: no repite la solicitud
    assert.equal(llamadas.length, 1);

    await act(async () => resolver({ coordinacion: coordinacion({ esMia: true }) }));
    assert.deepEqual(llamadas, [['exp-1', 'rel-1', 'op-1']]);
    assert.equal(actualizaciones.n, 1);
    assert.equal(arbol.root.findAllByType('button').filter((b) => b.children.join('') === 'Aceptar relevo').length, 0);
  });

  it('RELEVO_YA_RESUELTO muestra el mensaje y relee la pantalla', async () => {
    const { arbol, actualizaciones } = await montar({
      coordinacion: paraMi(),
      relevo: {
        aceptar: async () => {
          throw new ErrorClienteApi('El relevo ya fue resuelto.', 409, 'RELEVO_YA_RESUELTO');
        },
      },
    });
    await pulsar(arbol, 'Aceptar relevo');
    assert.match(textoDe(arbol), /El relevo ya fue resuelto/);
    assert.equal(actualizaciones.n, 1);
  });

  it('otro rescatista ve a quién se propone, sin motivo ni botones', async () => {
    const { arbol } = await montar({ coordinacion: coordinacion({ relevoPendiente: relevoPendiente() }) });
    assert.match(textoDe(arbol), /Relevo pendiente a Luis Relevo desde \d{2}:\d{2}$/);
    assert.deepEqual(botones(arbol), []);
  });

  it('lo que informa el servidor manda: una lectura nueva reemplaza la respuesta local', async () => {
    let arbol!: ReactTestRenderer;
    const props = {
      expedicionId: 'exp-1',
      estado: 'alerta' as const,
      alActualizar: () => undefined,
      relevo: {
        listarRescatistas: async () => ({ rescatistas: RESCATISTAS }),
        proponer: async () => ({
          coordinacion: coordinacion({ esMia: true, relevoPendiente: relevoPendiente() }),
        }),
      },
    };
    await act(async () => {
      arbol = create(<BloqueCoordinacion {...props} coordinacion={coordinacion({ esMia: true })} />);
    });
    await pulsar(arbol, 'Transferir coordinación');
    await completarFormulario(arbol);
    await pulsar(arbol, 'Confirmar transferencia');
    assert.match(textoDe(arbol), /Relevo pendiente a Luis Relevo/);

    await act(async () => {
      arbol.update(<BloqueCoordinacion {...props} coordinacion={coordinacion({ esMia: false, nombreResponsable: 'Luis Relevo', version: 5 })} />);
    });
    assert.doesNotMatch(textoDe(arbol), /Relevo pendiente/);
    assert.deepEqual(botones(arbol), []);
  });

  it('ningún texto del bloque contiene datos médicos', async () => {
    const { arbol } = await montar({ coordinacion: paraMi() });
    assert.doesNotMatch(textoDe(arbol), /sangre|alergi|medicament|ficha|salud/i);
  });
});
