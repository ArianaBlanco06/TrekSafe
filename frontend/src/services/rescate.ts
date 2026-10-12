import { api } from './clienteApi';

export type NivelRiesgoRescate = 'verde' | 'amarillo' | 'rojo';

export type ExpedicionRescate = {
  expedicionId: string;
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
};

export function obtenerExpedicionesRescate(zona?: string) {
  const params = zona?.trim() ? `?zona=${encodeURIComponent(zona.trim())}` : '';
  return api.get<{ expediciones: ExpedicionRescate[] }>(`/rescate/expediciones${params}`, true);
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
