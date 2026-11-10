import type { Coordinacion } from '@/services/rescate';
import { generarUuid } from './uuid';

export type EstadoExpedicionRescate = 'alerta' | 'en_progreso';

export type ResponsableVigente = {
  responsableId: string;
  nombreResponsable: string;
};

export const TEXTO_SIN_RESPONSABLE = 'Sin responsable';
export const TEXTO_YO_COORDINO = 'Tú coordinas esta alerta';
export const TEXTO_OTRO_COORDINA_SIN_NOMBRE = 'Otro rescatista ya coordina esta alerta';

/** El botón "Asumir coordinación" solo se ofrece a una alerta sin responsable. */
export function puedeAsumir(estado: EstadoExpedicionRescate, coordinacion: Coordinacion | null | undefined): boolean {
  return estado === 'alerta' && (coordinacion ?? null) === null;
}

/** Hora local `HH:MM`, o `null` si la fecha no es válida. `zonaHoraria` solo se usa en pruebas. */
export function horaCorta(iso: string, zonaHoraria?: string): string | null {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zonaHoraria,
  }).format(fecha);
}

export function textoCoordinadaPor(nombre: string, asumidoEn?: string, zonaHoraria?: string): string {
  const hora = asumidoEn ? horaCorta(asumidoEn, zonaHoraria) : null;
  return hora ? `Coordinada por ${nombre} · desde ${hora}` : `Coordinada por ${nombre}`;
}

/**
 * Texto de una coordinación vigente. "Tú coordinas" depende solo de `esMia`, nunca de
 * comparar nombres (dos rescatistas pueden llamarse igual).
 */
export function textoCoordinacion(coordinacion: Coordinacion, zonaHoraria?: string): string {
  if (coordinacion.esMia) return TEXTO_YO_COORDINO;
  return textoCoordinadaPor(coordinacion.nombreResponsable, coordinacion.asumidoEn, zonaHoraria);
}

/** Lee y valida `extras.responsableVigente` del error 409; `null` si falta o tiene otra forma. */
export function leerResponsableVigente(extras: Record<string, unknown> | undefined): ResponsableVigente | null {
  const valor = extras?.responsableVigente;
  if (typeof valor !== 'object' || valor === null) return null;
  const { responsableId, nombreResponsable } = valor as Record<string, unknown>;
  if (typeof responsableId !== 'string' || responsableId === '') return null;
  if (typeof nombreResponsable !== 'string' || nombreResponsable.trim() === '') return null;
  return { responsableId, nombreResponsable };
}

/**
 * Identidad del intento. El mismo `operacionId` se reutiliza mientras no se sepa si el
 * servidor llegó a procesar la solicitud (error de red o 5xx), para que el reintento no
 * cree otro incidente; tras una respuesta definitiva se descarta y el siguiente intento
 * usa uno nuevo.
 */
export type GestorOperacion = {
  /** El `operacionId` vigente; lo genera la primera vez que se pide. */
  obtener(): string;
  /** Descarta el `operacionId`: el intento terminó con una respuesta definitiva. */
  resolver(): void;
};

export function crearGestorOperacion(generar: () => string = generarUuid): GestorOperacion {
  let actual: string | null = null;
  return {
    obtener() {
      actual ??= generar();
      return actual;
    },
    resolver() {
      actual = null;
    },
  };
}

/** `true` si no se sabe si el servidor procesó la solicitud: sin respuesta (0) o 5xx. */
export function esResultadoIncierto(error: unknown): boolean {
  const estado = (error as { status?: unknown } | null)?.status;
  return typeof estado === 'number' ? estado === 0 || estado >= 500 : true;
}

export type ResultadoAsuncionUi =
  | { tipo: 'asumida'; coordinacion: Coordinacion }
  | { tipo: 'conflicto'; responsable: ResponsableVigente | null }
  | { tipo: 'error'; mensaje: string };

export type AsumirCoordinacion = (
  expedicionId: string,
  operacionId: string,
) => Promise<{ coordinacion: Coordinacion }>;

type ErrorHttp = { status?: number; codigo?: string; extras?: Record<string, unknown>; message?: string };

/** Un intento de asumir la coordinación, con la política de `operacionId` descrita arriba. */
export async function intentarAsumir(
  expedicionId: string,
  gestor: GestorOperacion,
  asumir: AsumirCoordinacion,
): Promise<ResultadoAsuncionUi> {
  const operacionId = gestor.obtener();
  try {
    const { coordinacion } = await asumir(expedicionId, operacionId);
    gestor.resolver();
    return { tipo: 'asumida', coordinacion };
  } catch (error) {
    const e = error as ErrorHttp;
    if (e.status === 409 && e.codigo === 'COORDINACION_YA_ASUMIDA') {
      gestor.resolver();
      return { tipo: 'conflicto', responsable: leerResponsableVigente(e.extras) };
    }
    const mensaje = e.message || 'No se pudo asumir la coordinación.';
    if (esResultadoIncierto(error)) {
      // Se conserva el operacionId: el reintento no puede duplicar la asunción.
      return { tipo: 'error', mensaje };
    }
    gestor.resolver();
    return { tipo: 'error', mensaje };
  }
}
