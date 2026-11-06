import { api, peticionApi } from './clienteApi';

export type Expedicion = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  estado: string;
  version: number;
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
  version: number;
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

export type DatosCrearExpedicion = {
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio?: string;
  coordenadasFin?: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
};

export function crearExpedicion(datos: DatosCrearExpedicion) {
  return api.post<{ expedicion: Expedicion }>('/expediciones', datos, true);
}

export type PlanExpedicion = Expedicion & {
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  idsContactos: string[];
  nombresAcompanantes: string[];
  actualizadoEn?: string;
};

export type DatosEdicionExpedicion = {
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio?: string;
  coordenadasFin?: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
  versionEsperada: number;
};

export function obtenerExpedicion(id: string) {
  return peticionApi<{ expedicion: PlanExpedicion }>(
    `/expediciones/${id}`,
    { method: 'GET', cache: 'no-store' },
    true,
  );
}

export function editarExpedicion(
  id: string,
  datos: DatosEdicionExpedicion,
  operacionId: string = crypto.randomUUID(),
) {
  return api.put<{ mensaje: string; expedicion: PlanExpedicion }>(
    `/expediciones/${id}`,
    { ...datos, operacionId },
    true,
  );
}

/** Mismo límite que `cancelarExpedicionSchema` en el backend. */
export const MAX_MOTIVO_CANCELACION = 200;

export type ResultadoCancelacion = {
  id: string;
  version: number;
  estado: 'cancelada';
};

/**
 * HU-27. El `operacionId` debe generarse una sola vez por intento y reutilizarse en
 * los reintentos: así el servidor devuelve el mismo resultado sin repetir la cancelación.
 */
export function cancelarExpedicion(
  id: string,
  motivo: string,
  operacionId: string = crypto.randomUUID(),
) {
  const motivoLimpio = motivo.trim();
  return api.post<{ mensaje: string; expedicion: ResultadoCancelacion }>(
    `/expediciones/${id}/cancelar`,
    { operacionId, ...(motivoLimpio ? { motivo: motivoLimpio } : {}) },
    true,
  );
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

export type BorradorDesdeHistorial = {
  origen: 'historial';
  origenId: string;
  descripcionOrigen: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  cantidadContactosNoVigentes: number;
  nombresAcompanantes: string[];
  horaInicio: null;
  horaRetornoEstimada: null;
  requiereFechasNuevas: true;
};

export function obtenerBorradorDesdeHistorial(id: string) {
  return peticionApi<{ borrador: BorradorDesdeHistorial }>(
    `/expediciones/${encodeURIComponent(id)}/borrador`,
    { method: 'GET', cache: 'no-store' },
    true,
  );
}
