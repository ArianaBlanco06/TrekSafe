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

// ---------------------------------------------------------------------------
// HU-40: relevo de la coordinación
// ---------------------------------------------------------------------------

export const MOTIVO_RELEVO_MAXIMO = 280;
export const ADVERTENCIA_MOTIVO_RELEVO = 'No incluyas datos médicos.';

/** Solo el responsable vigente propone, y solo si no hay ya un relevo pendiente. */
export function puedeProponerRelevo(coordinacion: Coordinacion | null | undefined): boolean {
  return !!coordinacion && coordinacion.esMia && !coordinacion.relevoPendiente;
}

/** Solo el destinatario del relevo pendiente lo acepta. */
export function puedeAceptarRelevo(coordinacion: Coordinacion | null | undefined): boolean {
  return coordinacion?.relevoPendiente?.esParaMi === true;
}

/** Mensaje de error del motivo, o `null` si es válido (1 a 280 caracteres tras recortar). */
export function validarMotivoRelevo(motivo: string): string | null {
  const recortado = motivo.trim();
  if (recortado === '') return 'Escribe el motivo del relevo.';
  if (recortado.length > MOTIVO_RELEVO_MAXIMO) return `El motivo admite hasta ${MOTIVO_RELEVO_MAXIMO} caracteres.`;
  return null;
}

/**
 * Texto del relevo pendiente según quién consulta. El motivo solo se menciona para el
 * destinatario; los demás rescatistas ven únicamente a quién se propone el relevo.
 */
export function textoRelevoPendiente(coordinacion: Coordinacion, zonaHoraria?: string): string | null {
  const relevo = coordinacion.relevoPendiente;
  if (!relevo) return null;
  if (relevo.esParaMi) {
    const base = `${coordinacion.nombreResponsable} te propone relevarlo`;
    return relevo.motivo ? `${base}: ${relevo.motivo}` : base;
  }
  const hora = horaCorta(relevo.solicitadoEn, zonaHoraria);
  const base = `Relevo pendiente a ${relevo.nombreDestinatario}`;
  const conHora = hora ? `${base} desde ${hora}` : base;
  return coordinacion.esMia ? `${conHora}. Sigues coordinando tú` : conHora;
}

export type ResultadoRelevoUi =
  | { tipo: 'ok'; coordinacion: Coordinacion }
  /** El estado cambió en el servidor: se muestra el motivo y se vuelve a leer la pantalla. */
  | { tipo: 'releer'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

/** Rechazos por un estado que cambió: no sirve reintentar, hay que releer. */
const CODIGOS_RELEER_RELEVO = new Set([
  'VERSION_DESACTUALIZADA',
  'RELEVO_PENDIENTE',
  'NO_ES_RESPONSABLE',
  'RELEVO_YA_RESUELTO',
  'NO_ES_DESTINATARIO',
  'RELEVO_NO_ENCONTRADO',
  'INCIDENTE_CERRADO',
]);

export type DatosRelevo = { destinatarioId: string; motivo: string; versionIncidente: number };
export type ProponerRelevoFn = (
  expedicionId: string,
  datos: DatosRelevo,
  operacionId: string,
) => Promise<{ coordinacion: Coordinacion }>;
export type AceptarRelevoFn = (
  expedicionId: string,
  relevoId: string,
  operacionId: string,
) => Promise<{ coordinacion: Coordinacion }>;

/** Misma política de `operacionId` que `intentarAsumir`: se conserva solo si el resultado es incierto. */
async function ejecutarRelevo(
  gestor: GestorOperacion,
  mensajePorDefecto: string,
  operacion: (operacionId: string) => Promise<{ coordinacion: Coordinacion }>,
): Promise<ResultadoRelevoUi> {
  const operacionId = gestor.obtener();
  try {
    const { coordinacion } = await operacion(operacionId);
    gestor.resolver();
    return { tipo: 'ok', coordinacion };
  } catch (error) {
    const e = error as ErrorHttp;
    const mensaje = e.message || mensajePorDefecto;
    if (esResultadoIncierto(error)) return { tipo: 'error', mensaje };
    gestor.resolver();
    if (e.codigo && CODIGOS_RELEER_RELEVO.has(e.codigo)) return { tipo: 'releer', mensaje };
    return { tipo: 'error', mensaje };
  }
}

export function intentarProponerRelevo(
  expedicionId: string,
  datos: DatosRelevo,
  gestor: GestorOperacion,
  proponer: ProponerRelevoFn,
): Promise<ResultadoRelevoUi> {
  return ejecutarRelevo(gestor, 'No se pudo proponer el relevo.', (operacionId) =>
    proponer(expedicionId, { ...datos, motivo: datos.motivo.trim() }, operacionId),
  );
}

export function intentarAceptarRelevo(
  expedicionId: string,
  relevoId: string,
  gestor: GestorOperacion,
  aceptar: AceptarRelevoFn,
): Promise<ResultadoRelevoUi> {
  return ejecutarRelevo(gestor, 'No se pudo aceptar el relevo.', (operacionId) =>
    aceptar(expedicionId, relevoId, operacionId),
  );
}
