import { api } from './clienteApi';

export type Expedicion = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  estado: string;
  creadoEn: string;
};

export type ExpedicionActiva = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  estado: 'programada' | 'en_progreso' | 'completada' | 'alerta';
  cantidadAcompanantes: number;
  cantidadContactos: number;
  acompanantes: string[];
  contactos: { nombreCompleto: string; correoElectronico: string }[];
};

export function obtenerExpediciones() {
  return api.get<{ expediciones: Expedicion[] }>('/expediciones', true);
}

export function obtenerExpedicionActiva() {
  return api.get<{ expedicion: ExpedicionActiva | null }>('/expediciones/activa', true);
}

export function crearExpedicion(datos: {
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio?: string;
  coordenadasFin?: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
}) {
  return api.post<{ expedicion: Expedicion }>('/expediciones', datos, true);
}

export function confirmarRetorno(expedicionId: string, contrasena: string) {
  return api.post<{
    mensaje: string;
    expedicion: Expedicion;
    confirmadoEn: string;
  }>(`/expediciones/${expedicionId}/confirmar-retorno`, { contrasena }, true);
}

export type EstadisticasHistorial = {
  totalCompletadas: number;
  destinosUnicos: number;
  promedioHoras: number;
  ultimaCompletadaEn: string | null;
};

export type ExpedicionCompletada = Expedicion & {
  actualizadoEn?: string;
};

export function obtenerHistorialExpediciones() {
  return api.get<{ expediciones: ExpedicionCompletada[]; estadisticas: EstadisticasHistorial }>(
    '/expediciones/historial',
    true,
  );
}
