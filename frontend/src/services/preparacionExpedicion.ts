import { api, peticionApi } from './clienteApi';
import { obtenerExpedicion } from './expedicion';
import { listasEquipoApi, type ListaEquipo } from './listasEquipo';

export type ItemPreparacion = { id: string; nombre: string; obligatorio: boolean; preparado: boolean };
export type PreparacionExpedicion = {
  id: string;
  expedicionId: string;
  listaOrigenId: string | null;
  nombreLista: string;
  items: ItemPreparacion[];
  obligatoriosPendientes: number;
  creadoEn: string;
  actualizadoEn: string;
};
export type ResumenExpedicionEquipo = { id: string; lugarFin: string; estado: string };

export interface PreparacionExpedicionApi {
  obtener(expedicionId: string): Promise<PreparacionExpedicion | null>;
  asociar(expedicionId: string, listaId: string): Promise<PreparacionExpedicion>;
  establecerPreparado(expedicionId: string, itemId: string, preparado: boolean): Promise<PreparacionExpedicion>;
}

const ruta = (id: string) => `/expediciones/${encodeURIComponent(id)}/equipo`;
export const preparacionExpedicionApi: PreparacionExpedicionApi = {
  async obtener(id) {
    return (await peticionApi<{ preparacion: PreparacionExpedicion | null }>(ruta(id), { cache: 'no-store' }, true)).preparacion;
  },
  async asociar(id, listaId) {
    return (await api.post<{ preparacion: PreparacionExpedicion }>(ruta(id), { listaId }, true)).preparacion;
  },
  async establecerPreparado(id, itemId, preparado) {
    return (await api.patch<{ preparacion: PreparacionExpedicion }>(
      `${ruta(id)}/items/${encodeURIComponent(itemId)}`, { preparado }, true,
    )).preparacion;
  },
};

/** Colaboradores de la pantalla; permite sustituir transporte sin cambiar su lógica. */
export interface FuentesEquipoExpedicion {
  preparacion: PreparacionExpedicionApi;
  obtenerExpedicion(id: string): Promise<ResumenExpedicionEquipo>;
  listarListas(): Promise<ListaEquipo[]>;
}
export const fuentesEquipoExpedicion: FuentesEquipoExpedicion = {
  preparacion: preparacionExpedicionApi,
  async obtenerExpedicion(id) {
    const expedicion = (await obtenerExpedicion(id)).expedicion;
    return { id: expedicion.id, lugarFin: expedicion.lugarFin, estado: expedicion.estado };
  },
  listarListas: () => listasEquipoApi.listar(),
};
