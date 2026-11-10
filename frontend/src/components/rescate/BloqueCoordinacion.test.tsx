import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BloqueCoordinacion, type BloqueCoordinacionProps } from './BloqueCoordinacion';
import type { Coordinacion } from '../../services/rescate';
import { ErrorClienteApi } from '../../services/clienteApi';

const coordinacion = (extra: Partial<Coordinacion> = {}): Coordinacion => ({
  incidenteId: 'inc-1',
  version: 1,
  responsableId: 'resp-1',
  nombreResponsable: 'Ana Rescate',
  asumidoEn: '2030-01-15T12:05:00.000Z',
  esMia: false,
  ...extra,
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

const boton = (arbol: ReactTestRenderer) => arbol.root.findAllByType('button')[0];

async function montar(props: Partial<BloqueCoordinacionProps> = {}) {
  let arbol!: ReactTestRenderer;
  const actualizaciones = { n: 0 };
  await act(async () => {
    arbol = create(
      <BloqueCoordinacion
        expedicionId="exp-1"
        estado="alerta"
        coordinacion={null}
        alActualizar={() => void (actualizaciones.n += 1)}
        {...props}
      />,
    );
  });
  return { arbol, actualizaciones };
}

const pulsar = (arbol: ReactTestRenderer) =>
  act(async () => {
    boton(arbol)!.props.onClick();
  });

describe('BloqueCoordinacion (HU-39)', () => {
  it('una alerta sin responsable muestra "Sin responsable" y el botón "Asumir coordinación"', async () => {
    const { arbol } = await montar();
    assert.match(textoDe(arbol), /Sin responsable/);
    assert.equal(boton(arbol)?.children.join(''), 'Asumir coordinación');
    assert.equal(boton(arbol)?.props.disabled, false);
  });

  it('el botón no aparece si la expedición no está en alerta', async () => {
    const { arbol } = await montar({ estado: 'en_progreso' });
    assert.equal(arbol.toJSON(), null);
  });

  it('el botón no aparece si ya hay responsable', async () => {
    const { arbol } = await montar({ coordinacion: coordinacion() });
    assert.equal(arbol.root.findAllByType('button').length, 0);
    assert.match(textoDe(arbol), /^Coordinada por Ana Rescate · desde \d{2}:\d{2}$/);
  });

  it('esMia muestra "Tú coordinas esta alerta" sin comparar nombres', async () => {
    const { arbol } = await montar({ coordinacion: coordinacion({ esMia: true }) });
    assert.equal(textoDe(arbol), 'Tú coordinas esta alerta');
    assert.equal(arbol.root.findAllByType('button').length, 0);
  });

  it('el mismo nombre con esMia=false no se muestra como propio', async () => {
    const { arbol } = await montar({ coordinacion: coordinacion({ esMia: false, nombreResponsable: 'Mi Nombre' }) });
    assert.doesNotMatch(textoDe(arbol), /Tú coordinas/);
    assert.match(textoDe(arbol), /Coordinada por Mi Nombre/);
  });

  it('el botón se deshabilita mientras se envía y, al terminar, muestra que coordinas y actualiza', async () => {
    let resolver!: (valor: { coordinacion: Coordinacion }) => void;
    const llamadas: [string, string][] = [];
    const { arbol, actualizaciones } = await montar({
      generarId: () => 'op-1',
      asumir: (expedicion, operacion) => {
        llamadas.push([expedicion, operacion]);
        return new Promise((resuelve) => void (resolver = resuelve));
      },
    });

    await pulsar(arbol);
    assert.equal(boton(arbol)?.props.disabled, true);
    assert.equal(boton(arbol)?.children.join(''), 'Asumiendo…');
    await pulsar(arbol); // un segundo clic mientras se envía no repite la solicitud
    assert.equal(llamadas.length, 1);

    await act(async () => resolver({ coordinacion: coordinacion({ esMia: true }) }));
    assert.deepEqual(llamadas, [['exp-1', 'op-1']]);
    assert.equal(textoDe(arbol), 'Tú coordinas esta alerta');
    assert.equal(actualizaciones.n, 1);
  });

  it('tras un error de red el botón se habilita y el reintento reutiliza el mismo operacionId', async () => {
    const usados: string[] = [];
    let intento = 0;
    const { arbol } = await montar({
      generarId: (() => {
        let n = 0;
        return () => `op-${++n}`;
      })(),
      asumir: async (_expedicion, operacion) => {
        usados.push(operacion);
        if (++intento === 1) throw new ErrorClienteApi('No se pudo conectar con el servidor.', 0);
        return { coordinacion: coordinacion({ esMia: true }) };
      },
    });

    await pulsar(arbol);
    assert.match(textoDe(arbol), /No se pudo conectar con el servidor\./);
    assert.equal(boton(arbol)?.props.disabled, false);

    await pulsar(arbol);
    assert.deepEqual(usados, ['op-1', 'op-1']);
    assert.equal(textoDe(arbol), 'Tú coordinas esta alerta');
  });

  it('un 409 muestra "Coordinada por <nombre del error>" y actualiza la pantalla', async () => {
    const { arbol, actualizaciones } = await montar({
      asumir: async () => {
        throw new ErrorClienteApi('Otro rescatista ya coordina esta alerta', 409, 'COORDINACION_YA_ASUMIDA', undefined, {
          responsableVigente: { responsableId: 'r2', nombreResponsable: 'Beto Rescate' },
        });
      },
    });

    await pulsar(arbol);

    assert.equal(textoDe(arbol), 'Coordinada por Beto Rescate');
    assert.equal(arbol.root.findAllByType('button').length, 0);
    assert.equal(actualizaciones.n, 1);
  });

  it('un 409 sin responsableVigente válido no inventa un nombre', async () => {
    const { arbol, actualizaciones } = await montar({
      asumir: async () => {
        throw new ErrorClienteApi('conflicto', 409, 'COORDINACION_YA_ASUMIDA', undefined, { responsableVigente: 1 });
      },
    });
    await pulsar(arbol);
    assert.equal(textoDe(arbol), 'Otro rescatista ya coordina esta alerta');
    assert.equal(actualizaciones.n, 1);
  });

  it('lo que informa el servidor manda sobre lo local tras la actualización', async () => {
    let arbol!: ReactTestRenderer;
    const asumir = async () => ({ coordinacion: coordinacion({ esMia: true }) });
    await act(async () => {
      arbol = create(
        <BloqueCoordinacion expedicionId="exp-1" estado="alerta" coordinacion={null} alActualizar={() => undefined} asumir={asumir} />,
      );
    });
    await pulsar(arbol);
    assert.equal(textoDe(arbol), 'Tú coordinas esta alerta');

    await act(async () => {
      arbol.update(
        <BloqueCoordinacion
          expedicionId="exp-1"
          estado="alerta"
          coordinacion={coordinacion({ esMia: false, nombreResponsable: 'Beto Rescate' })}
          alActualizar={() => undefined}
          asumir={asumir}
        />,
      );
    });
    assert.match(textoDe(arbol), /^Coordinada por Beto Rescate/);
  });
});
