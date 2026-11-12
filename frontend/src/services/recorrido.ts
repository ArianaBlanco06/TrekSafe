import { api } from './clienteApi';
import type { PuntoRuta } from './puntosRuta';
import type { PreparacionExpedicion } from './preparacionExpedicion';

export type RecorridoExpedicion = {
  plan: {
    id: string; estado: string; version: number;
    lugarInicio: string; lugarFin: string;
    coordenadasInicio: string | null; coordenadasFin: string | null;
    horaInicio: string; horaRetornoEstimada: string; minutosTolerancia: number;
  };
  puntos: PuntoRuta[];
  preparacion: PreparacionExpedicion | null;
};

export function obtenerRecorrido(id: string) {
  return api.get<RecorridoExpedicion>(`/expediciones/${encodeURIComponent(id)}/recorrido`, true);
}
