import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AyudaInstalacionPwa } from './AyudaInstalacionPwa';

async function montar(t: TestContext, modoApp = false, standaloneIos = false) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const cambios = new Set<() => void>();
  const consulta = {
    matches: modoApp,
    addEventListener: (_tipo: string, escuchar: () => void) => cambios.add(escuchar),
    removeEventListener: (_tipo: string, escuchar: () => void) => cambios.delete(escuchar),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { matchMedia: () => consulta, navigator: { standalone: standaloneIos } },
  });
  const llamadas = { aperturas: 0, cierres: 0, focos: 0 };
  let arbol!: ReactTestRenderer;
  t.after(async () => {
    await act(async () => arbol.unmount());
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  await act(async () => {
    arbol = create(<AyudaInstalacionPwa />, {
      createNodeMock: (elemento) => elemento.type === 'dialog'
        ? { showModal: () => { llamadas.aperturas += 1; }, close: () => { llamadas.cierres += 1; } }
        : { focus: () => { llamadas.focos += 1; } },
    });
  });
  const cambiarModo = (esApp: boolean) => act(async () => {
    consulta.matches = esApp;
    cambios.forEach((escuchar) => escuchar());
  });
  return { arbol, llamadas, cambiarModo, cambios };
}

describe('Ayuda de instalación según el modo de apertura', () => {
  it('se abre automáticamente al entrar desde navegador y permite cerrar y volver a abrir', async (t) => {
    const { arbol, llamadas } = await montar(t);
    assert.equal(llamadas.aperturas, 1);
    const botones = arbol.root.findAllByType('button');
    await act(async () => botones[1].props.onClick());
    assert.equal(llamadas.cierres, 1);
    assert.equal(llamadas.focos, 1);
    await act(async () => botones[0].props.onClick());
    assert.equal(llamadas.aperturas, 2);
  });

  it('permanece oculta cuando se abre como PWA instalada', async (t) => {
    const { arbol, llamadas } = await montar(t, true);
    assert.equal(arbol.toJSON(), null);
    assert.equal(llamadas.aperturas, 0);
  });

  it('reconoce la app de iPhone mediante navigator.standalone', async (t) => {
    const { arbol, llamadas } = await montar(t, false, true);
    assert.equal(arbol.toJSON(), null);
    assert.equal(llamadas.aperturas, 0);
  });

  it('se adapta al cambio entre navegador y ventana de la app', async (t) => {
    const { arbol, llamadas, cambiarModo } = await montar(t);
    await cambiarModo(true);
    assert.equal(arbol.toJSON(), null);
    assert.equal(llamadas.cierres, 1);
    await cambiarModo(false);
    assert.equal(llamadas.aperturas, 2);
    assert.equal(arbol.root.findAllByType('dialog').length, 1);
  });

  it('cada nueva entrada desde navegador vuelve a mostrar la ayuda', async (t) => {
    const { arbol, llamadas, cambios } = await montar(t);
    await act(async () => arbol.update(<></>));
    assert.equal(cambios.size, 0);
    await act(async () => arbol.update(<AyudaInstalacionPwa />));
    assert.equal(llamadas.aperturas, 2);
  });
});
