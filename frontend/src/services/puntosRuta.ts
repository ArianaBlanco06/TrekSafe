import { peticionApi } from './clienteApi';

export type PuntoRuta = {
  id: string;
  nombre: string;
  latitud: number;
  longitud: number;
  orden: number;
};

export type RutaConPuntos = {
  expedicion: {
    id: string;
    estado: string;
    lugarInicio: string;
    lugarFin: string;
    coordenadasInicio: string | null;
    coordenadasFin: string | null;
    horaInicio: string;
    version: number;
    editable: boolean;
  };
  puntos: PuntoRuta[];
};

/** Contrato HTTP del editor; no conoce componentes ni estado de React. */
export interface IPuntosRutaApi {
  consultar(id: string, signal?: AbortSignal): Promise<RutaConPuntos>;
  guardar(id: string, versionEsperada: number, puntos: PuntoRuta[], signal?: AbortSignal): Promise<RutaConPuntos>;
}

export const puntosRutaApi: IPuntosRutaApi = {
  consultar(id, signal) {
    return peticionApi<RutaConPuntos>(`/expediciones/${encodeURIComponent(id)}/puntos`, {
      method: 'GET', cache: 'no-store', signal,
    }, true);
  },
  guardar(id, versionEsperada, puntos, signal) {
    return peticionApi<RutaConPuntos>(`/expediciones/${encodeURIComponent(id)}/puntos`, {
      method: 'PUT', body: JSON.stringify({ versionEsperada, puntos }), signal,
    }, true);
  },
};
