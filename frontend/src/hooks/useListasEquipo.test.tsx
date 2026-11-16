import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useListasEquipo } from './useListasEquipo';
import { apiEquipoEnMemoria, promesaPendiente } from '../testing/listasEquipoApiPruebas';
import type { ListaEquipo, ListasEquipoApi } from '../services/listasEquipo';
import { ErrorClienteApi } from '../services/clienteApi';

async function preparar(t: TestContext, api: ListasEquipoApi) {
  let estado!: ReturnType<typeof useListasEquipo>;
  let arbol!: ReactTestRenderer;
  function Sonda({ enLinea }: { enLinea: boolean }) { estado = useListasEquipo(api, enLinea); return null; }
  await act(async () => { arbol = create(<Sonda enLinea />); });
  t.after(() => { act(() => arbol.unmount()); });
  return { actual: () => estado, conexion: (enLinea: boolean) => arbol.update(<Sonda enLinea={enLinea} />) };
}

describe('useListasEquipo', () => {
  it('expone un fallo de carga y permite reintentar', async (t) => {
    const api = apiEquipoEnMemoria();
    const listar = api.listar;
    api.listar = async () => { throw new ErrorClienteApi('detalle técnico', 0); };
    const prueba = await preparar(t, api);
    assert.match(prueba.actual().errorCarga, /Revisa tu conexión/);
    assert.equal(prueba.actual().cargando, false);
    api.listar = listar;
    await act(async () => { await prueba.actual().cargar(); });
    assert.equal(prueba.actual().errorCarga, '');
  });

  it('impide dos guardados simultáneos y aplica una sola respuesta', async (t) => {
    const api = apiEquipoEnMemoria();
    const crear = api.crear;
    const pendiente = promesaPendiente<ListaEquipo>();
    let llamadas = 0;
    api.crear = async () => { llamadas++; return pendiente.promesa; };
    const prueba = await preparar(t, api);
    let guardado!: Promise<ListaEquipo | null>;
    act(() => { guardado = prueba.actual().guardar({ nombre: 'Equipo', items: [] }); });
    assert.equal(prueba.actual().ocupado, true);
    await act(async () => {
      assert.equal(await prueba.actual().guardar({ nombre: 'Duplicada', items: [] }), null);
      pendiente.resolver(await crear({ nombre: 'Equipo', items: [] }));
      await guardado;
    });
    assert.equal(llamadas, 1);
    assert.equal(prueba.actual().listas.length, 1);
    assert.equal(prueba.actual().ocupado, false);
  });

  it('mantiene el estado anterior si fallan un guardado o una eliminación', async (t) => {
    const api = apiEquipoEnMemoria();
    const lista = await api.crear({ nombre: 'Equipo', items: [] });
    const prueba = await preparar(t, api);
    api.actualizar = async () => { throw new Error('No se pudo guardar.'); };
    api.eliminar = async () => { throw new Error('No se pudo eliminar.'); };
    await act(async () => { assert.equal(await prueba.actual().guardar({ nombre: 'Cambio', items: [] }, lista.id), null); });
    assert.equal(prueba.actual().listas[0].nombre, 'Equipo');
    await act(async () => { assert.equal(await prueba.actual().eliminar(lista.id), false); });
    assert.equal(prueba.actual().listas.length, 1);
    assert.match(prueba.actual().errorOperacion, /eliminar/);
  });

  it('descarta una lectura antigua que llega después del guardado', async (t) => {
    const api = apiEquipoEnMemoria();
    const crear = api.crear;
    const guardado = promesaPendiente<ListaEquipo>();
    api.crear = async () => guardado.promesa;
    const prueba = await preparar(t, api);
    let operacion!: Promise<ListaEquipo | null>;
    act(() => { operacion = prueba.actual().guardar({ nombre: 'Nueva', items: [] }); });
    const lectura = promesaPendiente<ListaEquipo[]>();
    api.listar = async () => lectura.promesa;
    let recarga!: Promise<void>;
    act(() => { recarga = prueba.actual().cargar(); });
    await act(async () => {
      guardado.resolver(await crear({ nombre: 'Nueva', items: [] }));
      await operacion;
    });
    await act(async () => { lectura.resolver([]); await recarga; });
    assert.equal(prueba.actual().listas[0].nombre, 'Nueva');
    assert.equal(prueba.actual().cargando, false);
  });

  it('bloquea escrituras sin red y vuelve a consultar al recuperar la conexión', async (t) => {
    const api = apiEquipoEnMemoria();
    const prueba = await preparar(t, api);
    await act(async () => { prueba.conexion(false); });
    await act(async () => { assert.equal(await prueba.actual().guardar({ nombre: 'Sin red', items: [] }), null); });
    await api.crear({ nombre: 'Desde otra sesión', items: [] });
    await act(async () => { prueba.conexion(true); });
    assert.equal(prueba.actual().listas[0].nombre, 'Desde otra sesión');
  });
});
