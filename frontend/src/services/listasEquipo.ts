import { api, peticionApi } from './clienteApi';

export type ItemListaEquipo = { id: string; nombre: string; obligatorio: boolean };
export type ListaEquipo = {
  id: string;
  senderistaId: string;
  nombre: string;
  items: ItemListaEquipo[];
  creadoEn: string;
  actualizadoEn: string;
};
export type DatosListaEquipo = {
  nombre: string;
  items: { id?: string; nombre: string; obligatorio: boolean }[];
};

export interface ListasEquipoApi {
  listar(): Promise<ListaEquipo[]>;
  obtener(id: string): Promise<ListaEquipo>;
  crear(datos: DatosListaEquipo): Promise<ListaEquipo>;
  actualizar(id: string, datos: DatosListaEquipo): Promise<ListaEquipo>;
  eliminar(id: string): Promise<void>;
}

const ruta = '/usuario/listas-equipo';

export const listasEquipoApi: ListasEquipoApi = {
  async listar() {
    const respuesta = await peticionApi<{ listas: ListaEquipo[] }>(ruta, { cache: 'no-store' }, true);
    return respuesta.listas;
  },
  async obtener(id) {
    const respuesta = await peticionApi<{ lista: ListaEquipo }>(`${ruta}/${encodeURIComponent(id)}`, { cache: 'no-store' }, true);
    return respuesta.lista;
  },
  async crear(datos) {
    return (await api.post<{ lista: ListaEquipo }>(ruta, datos, true)).lista;
  },
  async actualizar(id, datos) {
    return (await api.put<{ lista: ListaEquipo }>(`${ruta}/${encodeURIComponent(id)}`, datos, true)).lista;
  },
  async eliminar(id) {
    await api.delete<void>(`${ruta}/${encodeURIComponent(id)}`, true);
  },
};
