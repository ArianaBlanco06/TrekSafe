import { api } from './clienteApi';

export type AvanceExpedicion = {
  id: string; solicitudId: string; expedicionId: string;
  punto: { id: string; nombre: string; orden: number };
  registradoEn: string; nota: string | null;
};
export type SolicitudAvance = Readonly<{ solicitudId: string; puntoId: string; nota: string | null }>;
const ruta = (id: string) => `/expediciones/${encodeURIComponent(id)}/avances`;
export const avancesExpedicionApi = {
  registrar(id: string, solicitud: SolicitudAvance) {
    return api.post<{ avance: AvanceExpedicion; repetida: boolean }>(ruta(id), solicitud, true);
  },
  ultimo(id: string) { return api.get<{ ultimoAvance: AvanceExpedicion | null }>(`${ruta(id)}/ultimo`, true); },
};
