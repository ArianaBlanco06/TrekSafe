import { api } from './clienteApi';

/**
 * Cierre del incidente con informe (HU-42). Es el cierre OPERATIVO del rescate: no confirma
 * el retorno del senderista (eso lo hace él desde su aplicación). Sin datos médicos.
 */
// D1 (pendiente de confirmar con Marko y Jhon): catálogo sin estado de salud. Debe coincidir con el backend.
export type ResultadoRescate = 'localizado_sin_asistencia' | 'asistido_en_terreno' | 'evacuado' | 'falsa_alarma';

export type EstadoIncidenteRescate = 'abierto' | 'localizado' | 'cerrado';

export type InformeCierreIncidente = {
  id: string;
  incidenteId: string;
  expedicionId: string;
  resultado: ResultadoRescate;
  resumen: string;
  cerradoPor: { rescatistaId: string; nombreRescatista: string; esMio: boolean };
  /** Hora del servidor (ISO 8601 en UTC). */
  cerradoEn: string;
  entradaBitacoraId: string;
  tipoCierre: 'operativo';
  estadoExpedicion: 'programada' | 'en_progreso' | 'completada' | 'alerta' | 'cancelada';
  /** Solo es `true` si el senderista ya confirmó su retorno; el cierre nunca lo pone. */
  retornoConfirmadoPorSenderista: boolean;
};

export type EstadoIncidenteLocalizado = {
  incidenteId: string;
  expedicionId: string;
  estado: EstadoIncidenteRescate;
  version: number;
  responsable: { responsableId: string; nombreResponsable: string };
};

export type DatosCierreIncidente = {
  /** Identifica el intento: el mismo valor en un reintento no crea otro informe. */
  comandoId: string;
  resultado: ResultadoRescate;
  resumen: string;
};

export type DatosMarcarLocalizado = {
  /** Identifica el intento: el mismo valor en un reintento no duplica la nota. */
  operacionId: string;
};

export function marcarIncidenteLocalizado(incidenteId: string, datos: DatosMarcarLocalizado) {
  return api.post<{ incidente: EstadoIncidenteLocalizado; repetido: boolean }>(
    `/rescate/incidentes/${encodeURIComponent(incidenteId)}/localizacion`,
    datos,
    true,
  );
}

export function cerrarIncidente(incidenteId: string, datos: DatosCierreIncidente) {
  return api.post<{ cierre: InformeCierreIncidente }>(
    `/rescate/incidentes/${encodeURIComponent(incidenteId)}/cierre`,
    datos,
    true,
  );
}

export function obtenerCierreAlerta(expedicionId: string) {
  return api.get<{ cierre: InformeCierreIncidente | null }>(
    `/rescate/alertas/${encodeURIComponent(expedicionId)}/cierre`,
    true,
  );
}
