import { api } from './clienteApi';

export type NivelRiesgoRescate = 'verde' | 'amarillo' | 'rojo';
export type CriterioPrioridadRescate = 'tiempo_excedido' | 'tamano_grupo';

/**
 * Responsable vigente de una alerta (HU-39). Lo ven todos los rescatistas autorizados y
 * no incluye datos médicos. `esMia` indica si quien consulta es el responsable.
 */
export type Coordinacion = {
  incidenteId: string;
  version: number;
  responsableId: string;
  nombreResponsable: string;
  asumidoEn: string;
  esMia: boolean;
};

export type ExpedicionRescate = {
  expedicionId: string;
  numeroParticipantes: number;
  estado: 'en_progreso' | 'alerta';
  nivelRiesgo: NivelRiesgoRescate;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  minutosRestantes: number | null;
  minutosExcedidos: number | null;
  enAlertaDesde: string | null;
  confirmadoPorMi: boolean;
  confirmadoEn: string | null;
  estadoRescate: string | null;
  coordinacion: Coordinacion | null;
};

export type AlertaRescate = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  enAlertaDesde: string;
  confirmadoPorMi: boolean;
  confirmadoEn: string | null;
  estadoRescate: string | null;
  coordinacion: Coordinacion | null;
};

export function obtenerExpedicionesRescate(zona?: string, criterio?: CriterioPrioridadRescate) {
  const params = new URLSearchParams();
  if (zona?.trim()) params.set('zona', zona.trim());
  if (criterio) params.set('criterio', criterio);
  const consulta = params.toString();
  return api.get<{ expediciones: ExpedicionRescate[] }>(
    `/rescate/expediciones${consulta ? `?${consulta}` : ''}`,
    true,
  );
}

export function obtenerAlertasRescate() {
  return api.get<{ alertas: AlertaRescate[] }>('/rescate/alertas', true);
}

export type ItemHistorialRescatista = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  completadaEn: string;
  estadoRescate: string;
  confirmadoEn: string;
  notas: string | null;
};

export function obtenerHistorialRescatista() {
  return api.get<{ historial: ItemHistorialRescatista[] }>('/rescate/historial', true);
}

export function confirmarAlertaRescate(expedicionId: string, notas?: string) {
  return api.post<{
    mensaje: string;
    confirmacion: {
      id: string;
      expedicionId: string;
      estadoRescate: string;
      confirmadoEn: string;
      notas: string | null;
    };
  }>(`/rescate/alertas/${expedicionId}/confirmar`, notas ? { notas } : {}, true);
}

/**
 * Asume la coordinación de la alerta (HU-39). `operacionId` identifica el intento: el mismo
 * valor en un reintento no crea otro incidente. Es independiente de `confirmarAlertaRescate`.
 */
export function asumirCoordinacion(expedicionId: string, operacionId: string) {
  return api.post<{ coordinacion: Coordinacion }>(
    `/rescate/alertas/${expedicionId}/coordinacion`,
    { operacionId },
    true,
  );
}

export type DetalleAlertaRescate = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  enAlertaDesde: string;
  acompanantes: string[];
  contactosEmergencia: {
    nombreCompleto: string;
    telefono: string;
    parentesco: string;
    correoElectronico: string;
  }[];
  fichaMedica: {
    tipoSangre: string;
    alergias: string;
    condiciones: string;
    medicamentos: string;
  } | null;
  bitacora: {
    id: string;
    estadoRescate: string;
    notas: string | null;
    actualizadoEn: string;
  } | null;
  coordinacion: Coordinacion | null;
};

export type EstadoRescate = 'en_busqueda' | 'localizados' | 'cerrado';

type BitacoraApi = {
  id: string;
  expedicionId?: string;
  estadoRescate: string;
  notas: string | null;
  actualizadoEn: string;
};

function normalizarDetalleAlerta(
  alerta: Omit<DetalleAlertaRescate, 'bitacora'> & {
    bitacora?: BitacoraApi | null;
    bitacoraRescate?: BitacoraApi | null;
  },
): DetalleAlertaRescate {
  const bitacora = alerta.bitacora ?? alerta.bitacoraRescate ?? null;
  return { ...alerta, bitacora };
}

export async function obtenerDetalleAlertaRescate(expedicionId: string) {
  const res = await api.get<{
    alerta: Omit<DetalleAlertaRescate, 'bitacora'> & {
      bitacora?: BitacoraApi | null;
      bitacoraRescate?: BitacoraApi | null;
    };
  }>(`/rescate/alertas/${expedicionId}`, true);

  return { alerta: normalizarDetalleAlerta(res.alerta) };
}

export async function actualizarBitacoraRescate(
  expedicionId: string,
  datos: { estadoRescate?: EstadoRescate; notas?: string },
) {
  const res = await api.patch<{
    mensaje: string;
    bitacora?: BitacoraApi;
    bitacoraRescate?: BitacoraApi;
  }>(`/rescate/alertas/${expedicionId}/bitacora`, datos, true);

  const bitacora = res.bitacora ?? res.bitacoraRescate;
  if (!bitacora) {
    throw new Error('Respuesta de bitácora incompleta');
  }

  return {
    mensaje: res.mensaje,
    bitacora: {
      id: bitacora.id,
      expedicionId: bitacora.expedicionId ?? expedicionId,
      estadoRescate: bitacora.estadoRescate,
      notas: bitacora.notas,
      actualizadoEn: bitacora.actualizadoEn,
    },
  };
}
