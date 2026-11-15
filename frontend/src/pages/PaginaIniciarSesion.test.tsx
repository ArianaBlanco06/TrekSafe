import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAutenticacion } from '../context/ContextoAutenticacion';
import { RutaProtegida } from '../components/RutaProtegida';
import { PaginaIniciarSesion } from './PaginaIniciarSesion';

async function entorno(t: TestContext, inicial: string | { pathname: string; state: unknown }, rol: 'senderista' | 'rescatista') {
  const datos = new Map<string, string>();
  const storage = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v), removeItem: (k: string) => datos.delete(k) };
  const descriptores = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ sessionStorage: storage, localStorage: storage })) {
    descriptores.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ token: 'token-fixture', usuario: { id: 'usuario-fixture', rol, correoElectronico: 'cuenta@example.invalid' } }));
  let ubicacion = '';
  function Observar() { const location = useLocation(); ubicacion = location.pathname + location.search + location.hash; return null; }
  function Incidente() { const { logout } = useAutenticacion(); return <button onClick={() => logout()}>Salir del incidente</button>; }
  let arbol!: ReactTestRenderer;
  t.after(async () => {
    if (arbol) await act(async () => arbol.unmount());
    for (const [key, descriptor] of descriptores) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  });
  await act(async () => { arbol = create(<MemoryRouter initialEntries={[inicial]}><AuthProvider><Observar /><Routes>
    <Route path="/iniciar-sesion" element={<PaginaIniciarSesion />} />
    <Route path="/rescatista/alertas/:id" element={<RutaProtegida rol="rescatista"><Incidente /></RutaProtegida>} />
    <Route path="/rescatista" element={<p>Inicio de rescate</p>} />
    <Route path="/senderista" element={<p>Inicio senderista</p>} />
  </Routes></AuthProvider></MemoryRouter>); });
  return {
    ubicacion: () => ubicacion,
    async salir() {
      await act(async () => arbol.root.findAllByType('button').find((b) => b.children.includes('Salir del incidente'))!.props.onClick());
    },
    async login() {
      const boton = arbol.root.findAllByType('button').find((b) => b.children.includes(rol === 'rescatista' ? 'Rescatista' : 'Senderista'))!;
      await act(async () => boton.props.onClick());
      await act(async () => { await arbol.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    },
  };
}

it('enlace al incidente → login → mismo destino local después de autenticar rescatista', async (t) => {
  const e = await entorno(t, '/rescatista/alertas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?origen=correo', 'rescatista');
  assert.equal(e.ubicacion(), '/iniciar-sesion');
  await e.login();
  assert.equal(e.ubicacion(), '/rescatista/alertas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?origen=correo');
  await e.salir();
  assert.equal(e.ubicacion(), '/iniciar-sesion');
  await e.login();
  assert.equal(e.ubicacion(), '/rescatista', 'el logout explícito descarta el destino privado anterior');
});
it('login senderista no conserva un destino de rescatista', async (t) => {
  const e = await entorno(t, { pathname: '/iniciar-sesion', state: { from: { pathname: '/rescatista/alertas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } }, 'senderista');
  await e.login();
  assert.equal(e.ubicacion(), '/senderista');
});
it('login rechaza un destino externo manipulado', async (t) => {
  const e = await entorno(t, { pathname: '/iniciar-sesion', state: { from: { pathname: '//externo.example/' } } }, 'rescatista');
  await e.login();
  assert.equal(e.ubicacion(), '/rescatista');
});
