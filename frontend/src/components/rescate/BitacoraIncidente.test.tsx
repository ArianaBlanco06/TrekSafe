import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BitacoraIncidente, type BitacoraIncidenteProps } from './BitacoraIncidente';
import { ErrorClienteApi } from '../../services/clienteApi';
import type { BitacoraIncidente as DatosBitacora, EntradaBitacoraIncidente, NuevaEntradaBitacora } from '../../services/bitacoraIncidente';

const entrada = (id: string, texto: string, hora: string, extra: Partial<EntradaBitacoraIncidente> = {}): EntradaBitacoraIncidente => ({
  id,
  tipo: 'nota',
  texto,
  autor: { autorId: 'a1', nombreAutor: 'Ana Rescate', esMia: false },
  registradaEn: `2030-01-15T${hora}:00.000Z`,
  corrigeEntradaId: null,
  ...extra,
});

const tres = [entrada('e1', 'Primera nota', '12:01'), entrada('e2', 'Segunda nota', '12:02'), entrada('e3', 'Tercera nota', '12:03')];

const bitacora = (extra: Partial<DatosBitacora> = {}): DatosBitacora => ({
  incidenteId: 'inc-1',
  expedicionId: 'exp-1',
  estado: 'abierto',
  responsable: { responsableId: 'a1', nombreResponsable: 'Ana Rescate' },
  esResponsable: true,
  puedeEscribir: true,
  entradas: tres,
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

const textarea = (arbol: ReactTestRenderer) => arbol.root.findAllByType('textarea')[0];
const botonPorTexto = (arbol: ReactTestRenderer, texto: string) =>
  arbol.root.findAllByType('button').find((b) => b.children.join('') === texto);
const botonesPorTexto = (arbol: ReactTestRenderer, texto: string) =>
  arbol.root.findAllByType('button').filter((b) => b.children.join('') === texto);

async function montar(props: Partial<BitacoraIncidenteProps> & { datos?: DatosBitacora[] } = {}) {
  const { datos = [bitacora()], ...resto } = props;
  const lecturas = { n: 0 };
  const cambios = { n: 0 };
  let arbol!: ReactTestRenderer;
  await act(async () => {
    arbol = create(
      <BitacoraIncidente
        incidenteId="inc-1"
        zonaHoraria="UTC"
        generarId={(() => {
          let n = 0;
          return () => `op-${++n}`;
        })()}
        cargar={async () => {
          const d = datos[Math.min(lecturas.n, datos.length - 1)]!;
          lecturas.n += 1;
          return { bitacora: d };
        }}
        alCambiarResponsable={() => void (cambios.n += 1)}
        {...resto}
      />,
    );
  });
  return { arbol, lecturas, cambios };
}

const escribirTexto = (arbol: ReactTestRenderer, valor: string) =>
  act(async () => {
    textarea(arbol)!.props.onChange({ target: { value: valor } });
  });
const pulsar = (arbol: ReactTestRenderer, texto: string) =>
  act(async () => {
    botonPorTexto(arbol, texto)!.props.onClick();
  });

describe('BitacoraIncidente (HU-41)', () => {
  it('muestra la lista en el orden que dio el servidor, con autor, hora y texto', async () => {
    const { arbol } = await montar();
    const items = arbol.root.findAllByType('li');
    assert.equal(items.length, 3);
    const contenido = textoDe(arbol);
    assert.ok(contenido.indexOf('Primera nota') < contenido.indexOf('Segunda nota'));
    assert.ok(contenido.indexOf('Segunda nota') < contenido.indexOf('Tercera nota'));
    assert.match(contenido, /Bitácora del incidente/);
    assert.match(contenido, /15\/01\/2030 12:01/);
    assert.match(contenido, /Ana Rescate/);
    assert.equal(arbol.root.findByType('ol').props['aria-label'], 'Entradas de la bitácora');
  });

  it('la lista vacía muestra "Aún no hay entradas."', async () => {
    const { arbol } = await montar({ datos: [bitacora({ entradas: [] })] });
    assert.match(textoDe(arbol), /Aún no hay entradas\./);
    assert.equal(arbol.root.findAllByType('li').length, 0);
  });

  it('con puedeEscribir=false no hay textarea y se ve el texto de solo lectura', async () => {
    const { arbol } = await montar({
      datos: [bitacora({ esResponsable: false, puedeEscribir: false, responsable: { responsableId: 'b', nombreResponsable: 'Beto Rescate' } })],
    });
    assert.equal(arbol.root.findAllByType('textarea').length, 0);
    assert.match(textoDe(arbol), /Solo Beto Rescate \(responsable vigente\) puede añadir entradas\./);
    assert.equal(botonesPorTexto(arbol, 'Corregir').length, 0);
  });

  it('con el incidente cerrado no hay formulario y se indica que es de solo lectura', async () => {
    const { arbol } = await montar({ datos: [bitacora({ estado: 'cerrado', puedeEscribir: false })] });
    assert.equal(arbol.root.findAllByType('textarea').length, 0);
    assert.match(textoDe(arbol), /Incidente cerrado: la bitácora es de solo lectura\./);
  });

  it('con puedeEscribir=true aparecen el aviso de privacidad y el textarea con maxLength 2000', async () => {
    const { arbol } = await montar();
    assert.equal(textarea(arbol)?.props.maxLength, 2000);
    const aviso = arbol.root.findAll((n) => n.props.role === 'note')[0];
    assert.ok(aviso);
    assert.match(aviso.children.join(''), /No registres datos médicos/);
    assert.match(textoDe(arbol), /0\/2000/);
  });

  it('un envío llama a agregar con texto y operacionId, limpia el formulario y vuelve a cargar', async () => {
    const llamadas: [string, NuevaEntradaBitacora][] = [];
    const { arbol, lecturas } = await montar({
      agregar: async (id, e) => {
        llamadas.push([id, e]);
        return { entrada: entrada('e4', e.texto, '12:04') };
      },
    });
    assert.equal(lecturas.n, 1);
    await escribirTexto(arbol, '  Nueva nota  ');
    await pulsar(arbol, 'Añadir entrada');
    assert.deepEqual(llamadas, [['inc-1', { operacionId: 'op-1', texto: 'Nueva nota', corrigeEntradaId: null }]]);
    assert.equal(lecturas.n, 2);
    assert.equal(textarea(arbol)?.props.value, '');
    assert.match(textoDe(arbol), /Entrada añadida/);
  });

  it('un texto vacío no se envía y muestra el error', async () => {
    let llamadas = 0;
    const { arbol } = await montar({ agregar: async () => { llamadas += 1; return { entrada: entrada('x', 'x', '12:00') }; } });
    await escribirTexto(arbol, '   ');
    await pulsar(arbol, 'Añadir entrada');
    assert.equal(llamadas, 0);
    assert.match(textoDe(arbol), /El texto no puede estar vacío/);
  });

  it('"Corregir" envía corrigeEntradaId y "Cancelar corrección" lo quita', async () => {
    const llamadas: NuevaEntradaBitacora[] = [];
    const { arbol } = await montar({
      agregar: async (_id, e) => {
        llamadas.push(e);
        return { entrada: entrada('e4', e.texto, '12:04', { tipo: 'correccion', corrigeEntradaId: e.corrigeEntradaId ?? null }) };
      },
    });
    await act(async () => {
      botonesPorTexto(arbol, 'Corregir')[1]!.props.onClick();
    });
    assert.match(textoDe(arbol), /Corrigiendo la entrada de 12:02/);
    await act(async () => {
      botonPorTexto(arbol, 'Cancelar corrección')!.props.onClick();
    });
    assert.doesNotMatch(textoDe(arbol), /Corrigiendo la entrada/);

    await act(async () => {
      botonesPorTexto(arbol, 'Corregir')[1]!.props.onClick();
    });
    await escribirTexto(arbol, 'Texto corregido');
    await pulsar(arbol, 'Añadir entrada');
    assert.deepEqual(llamadas, [{ operacionId: 'op-1', texto: 'Texto corregido', corrigeEntradaId: 'e2' }]);
    assert.doesNotMatch(textoDe(arbol), /Corrigiendo la entrada/);
  });

  it('una corrección existente indica qué entrada corrige', async () => {
    const { arbol } = await montar({
      datos: [bitacora({ entradas: [...tres, entrada('e4', 'Corregida', '12:04', { tipo: 'correccion', corrigeEntradaId: 'e2' })] })],
    });
    assert.match(textoDe(arbol), /Corrige la entrada de 12:02 de Ana Rescate: «Segunda nota»/);
  });

  it('error sin respuesta: el textarea queda readOnly, "Reintentar envío" reutiliza el mismo operacionId y "Descartar" genera uno nuevo', async () => {
    const usados: string[] = [];
    let intento = 0;
    const { arbol } = await montar({
      agregar: async (_id, e) => {
        usados.push(e.operacionId);
        intento += 1;
        if (intento <= 2) throw new ErrorClienteApi('No se pudo conectar con el servidor.', 0);
        return { entrada: entrada('e4', e.texto, '12:04') };
      },
    });
    await escribirTexto(arbol, 'Con error');
    await pulsar(arbol, 'Añadir entrada');
    assert.match(textoDe(arbol), /No se pudo conectar con el servidor\./);
    assert.equal(textarea(arbol)?.props.readOnly, true);
    assert.ok(botonPorTexto(arbol, 'Reintentar envío'));
    assert.ok(botonPorTexto(arbol, 'Descartar'));
    assert.ok(botonesPorTexto(arbol, 'Corregir').every((b) => b.props.disabled === true));

    await pulsar(arbol, 'Reintentar envío');
    assert.deepEqual(usados, ['op-1', 'op-1']);
    assert.equal(textarea(arbol)?.props.readOnly, true);

    await pulsar(arbol, 'Descartar');
    assert.equal(textarea(arbol)?.props.readOnly, false);
    assert.equal(botonPorTexto(arbol, 'Reintentar envío'), undefined);
    await pulsar(arbol, 'Añadir entrada');
    assert.deepEqual(usados, ['op-1', 'op-1', 'op-2']);
  });

  it('403 NO_ES_RESPONSABLE avisa, llama a alCambiarResponsable y oculta el formulario tras la recarga', async () => {
    const { arbol, cambios } = await montar({
      datos: [
        bitacora(),
        bitacora({ esResponsable: false, puedeEscribir: false, responsable: { responsableId: 'b', nombreResponsable: 'Beto Rescate' } }),
      ],
      agregar: async () => {
        throw new ErrorClienteApi('No eres responsable', 403, 'NO_ES_RESPONSABLE', undefined, {
          responsableVigente: { responsableId: 'b', nombreResponsable: 'Beto Rescate' },
        });
      },
    });
    await escribirTexto(arbol, 'Tarde');
    await pulsar(arbol, 'Añadir entrada');
    assert.match(textoDe(arbol), /Ahora coordina Beto Rescate; ya no puedes añadir entradas\./);
    assert.equal(cambios.n, 1);
    assert.equal(arbol.root.findAllByType('textarea').length, 0);
  });

  it('409 INCIDENTE_CERRADO avisa, recarga y llama a alCambiarResponsable', async () => {
    const { arbol, cambios } = await montar({
      datos: [bitacora(), bitacora({ estado: 'cerrado', puedeEscribir: false })],
      agregar: async () => {
        throw new ErrorClienteApi('Cerrado', 409, 'INCIDENTE_CERRADO');
      },
    });
    await escribirTexto(arbol, 'Tarde');
    await pulsar(arbol, 'Añadir entrada');
    assert.match(textoDe(arbol), /El incidente está cerrado/);
    assert.equal(cambios.n, 1);
    assert.equal(arbol.root.findAllByType('textarea').length, 0);
  });

  it('si la carga falla muestra el error y "Reintentar" vuelve a cargar', async () => {
    let intento = 0;
    const { arbol } = await montar({
      cargar: async () => {
        intento += 1;
        if (intento === 1) throw new ErrorClienteApi('No se pudo conectar con el servidor.', 0);
        return { bitacora: bitacora() };
      },
    });
    assert.match(textoDe(arbol), /No se pudo conectar con el servidor\./);
    await act(async () => {
      botonPorTexto(arbol, 'Reintentar')!.props.onClick();
    });
    assert.match(textoDe(arbol), /Primera nota/);
    assert.doesNotMatch(textoDe(arbol), /No se pudo conectar/);
  });
});
