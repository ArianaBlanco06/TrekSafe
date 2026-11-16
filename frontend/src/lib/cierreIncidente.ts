import { AVISO_PRIVACIDAD_BITACORA } from '@/lib/bitacoraIncidente';
import {
  esResultadoIncierto,
  leerResponsableVigente,
  type GestorOperacion,
  type ResponsableVigente,
} from '@/lib/coordinacionRescate';
import type {
  DatosCierreIncidente,
  DatosMarcarLocalizado,
  EstadoIncidenteLocalizado,
  InformeCierreIncidente,
  ResultadoRescate,
} from '@/services/cierreIncidente';

export { AVISO_PRIVACIDAD_BITACORA };

/** Debe coincidir con RESULTADOS_RESCATE del backend (D1, pendiente de confirmar con Marko y Jhon). */
export const RESULTADOS_RESCATE: readonly ResultadoRescate[] = [
  'localizado_sin_asistencia',
  'asistido_en_terreno',
  'evacuado',
  'falsa_alarma',
];

export const ETIQUETAS_RESULTADO_RESCATE: Record<ResultadoRescate, string> = {
  localizado_sin_asistencia: 'Localizado sin asistencia',
  asistido_en_terreno: 'Asistido en terreno',
  evacuado: 'Evacuado',
  falsa_alarma: 'Falsa alarma',
};

/** Debe coincidir con LIMITE_RESUMEN_CIERRE del backend. */
export const LIMITE_RESUMEN_CIERRE = 2000;

/** CA-3: el cierre del operativo no es el retorno del senderista. */
export const TEXTO_CIERRE_OPERATIVO =
  'Cerrar el rescate no confirma el retorno del senderista: solo él puede confirmarlo desde su aplicación.';

export function textoRetorno(informe: Pick<InformeCierreIncidente, 'retornoConfirmadoPorSenderista'>): string {
  return informe.retornoConfirmadoPorSenderista
    ? 'Retorno confirmado por el senderista'
    : 'Retorno aún no confirmado por el senderista';
}

/** Mensaje de error del cierre, o `null` si es válido (resultado del catálogo y resumen de 1 a 2000 tras recortar). */
export function validarCierre(datos: { resultado: string; resumen: string }): string | null {
  if (!(RESULTADOS_RESCATE as readonly string[]).includes(datos.resultado)) return 'Elige el resultado del rescate';
  const resumen = datos.resumen.trim();
  if (resumen.length === 0) return 'El resumen no puede estar vacío';
  if (resumen.length > LIMITE_RESUMEN_CIERRE) return `Máximo ${LIMITE_RESUMEN_CIERRE} caracteres`;
  return null;
}

export type CerrarIncidenteApi = (
  incidenteId: string,
  datos: DatosCierreIncidente,
) => Promise<{ cierre: InformeCierreIncidente }>;

export type MarcarLocalizadoApi = (
  incidenteId: string,
  datos: DatosMarcarLocalizado,
) => Promise<{ incidente: EstadoIncidenteLocalizado; repetido: boolean }>;

export type ResultadoCerrarUi =
  | { tipo: 'cerrado'; informe: InformeCierreIncidente }
  | { tipo: 'no_responsable'; responsable: ResponsableVigente | null }
  | { tipo: 'no_localizado' }
  | { tipo: 'ya_cerrado' }
  | { tipo: 'error'; mensaje: string; incierto: boolean };

export type ResultadoLocalizarUi =
  | { tipo: 'localizado'; incidente: EstadoIncidenteLocalizado }
  | { tipo: 'no_responsable'; responsable: ResponsableVigente | null }
  | { tipo: 'cerrado' }
  | { tipo: 'error'; mensaje: string; incierto: boolean };

type ErrorHttp = { status?: number; codigo?: string; extras?: Record<string, unknown>; message?: string };

/**
 * Un intento de cerrar el incidente. El `comandoId` se conserva mientras no se sepa si el
 * servidor llegó a procesar la solicitud (error de red o 5xx), para que el reintento no cree
 * otro informe; tras una respuesta definitiva se descarta.
 */
export async function intentarCerrarIncidente(
  incidenteId: string,
  gestor: GestorOperacion,
  cerrar: CerrarIncidenteApi,
  datos: { resultado: ResultadoRescate; resumen: string },
): Promise<ResultadoCerrarUi> {
  const comandoId = gestor.obtener();
  try {
    const { cierre } = await cerrar(incidenteId, { comandoId, resultado: datos.resultado, resumen: datos.resumen });
    gestor.resolver();
    return { tipo: 'cerrado', informe: cierre };
  } catch (error) {
    const e = error as ErrorHttp;
    if (e.status === 403 && e.codigo === 'NO_ES_RESPONSABLE') {
      gestor.resolver();
      return { tipo: 'no_responsable', responsable: leerResponsableVigente(e.extras) };
    }
    if (e.status === 409 && e.codigo === 'INCIDENTE_NO_LOCALIZADO') {
      gestor.resolver();
      return { tipo: 'no_localizado' };
    }
    if (e.status === 409 && e.codigo === 'INCIDENTE_CERRADO') {
      gestor.resolver();
      return { tipo: 'ya_cerrado' };
    }
    const mensaje = e.message || 'No se pudo cerrar el incidente.';
    if (esResultadoIncierto(error)) {
      // Se conserva el comandoId: el reintento no puede crear un segundo informe.
      return { tipo: 'error', mensaje, incierto: true };
    }
    gestor.resolver();
    return { tipo: 'error', mensaje, incierto: false };
  }
}

/** Un intento de marcar la persona como localizada, con la misma política de reintento. */
export async function intentarMarcarLocalizado(
  incidenteId: string,
  gestor: GestorOperacion,
  marcar: MarcarLocalizadoApi,
): Promise<ResultadoLocalizarUi> {
  const operacionId = gestor.obtener();
  try {
    const { incidente } = await marcar(incidenteId, { operacionId });
    gestor.resolver();
    return { tipo: 'localizado', incidente };
  } catch (error) {
    const e = error as ErrorHttp;
    if (e.status === 403 && e.codigo === 'NO_ES_RESPONSABLE') {
      gestor.resolver();
      return { tipo: 'no_responsable', responsable: leerResponsableVigente(e.extras) };
    }
    if (e.status === 409 && e.codigo === 'INCIDENTE_CERRADO') {
      gestor.resolver();
      return { tipo: 'cerrado' };
    }
    const mensaje = e.message || 'No se pudo marcar a la persona como localizada.';
    if (esResultadoIncierto(error)) return { tipo: 'error', mensaje, incierto: true };
    gestor.resolver();
    return { tipo: 'error', mensaje, incierto: false };
  }
}
