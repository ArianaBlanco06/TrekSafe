import {
  esResultadoIncierto,
  leerResponsableVigente,
  type GestorOperacion,
  type ResponsableVigente,
} from '@/lib/coordinacionRescate';
import type {
  BitacoraIncidente,
  EntradaBitacoraIncidente,
  NuevaEntradaBitacora,
  TipoEntradaBitacora,
} from '@/services/bitacoraIncidente';

/** Debe coincidir con LIMITE_TEXTO_ENTRADA_BITACORA del backend. */
export const LIMITE_TEXTO_ENTRADA = 2000;

export const AVISO_PRIVACIDAD_BITACORA =
  'No registres datos médicos ni de salud de la persona: todos los rescatistas pueden leer esta bitácora.';

export const ETIQUETAS_TIPO_ENTRADA: Record<TipoEntradaBitacora, string> = {
  nota: 'Nota',
  correccion: 'Corrección',
  cierre: 'Cierre',
};

/** Mensaje de error del texto, o `null` si es válido (1 a 2000 caracteres tras recortar). */
export function validarTextoEntrada(texto: string): string | null {
  const recortado = texto.trim();
  if (recortado.length === 0) return 'El texto no puede estar vacío';
  if (recortado.length > LIMITE_TEXTO_ENTRADA) return `Máximo ${LIMITE_TEXTO_ENTRADA} caracteres`;
  return null;
}

/** `dd/mm/aaaa HH:MM` en hora local (es-PE), o `—` si la fecha no es válida. `zonaHoraria` solo se usa en pruebas. */
export function fechaHoraEntrada(iso: string, zonaHoraria?: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  const partes = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zonaHoraria,
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('day')}/${valor('month')}/${valor('year')} ${valor('hour')}:${valor('minute')}`;
}

/** "Tú" si la entrada es del consultante (por `esMia`, nunca por nombre); si no, el nombre del autor. */
export function textoAutorEntrada(entrada: EntradaBitacoraIncidente): string {
  return entrada.autor.esMia ? 'Tú' : entrada.autor.nombreAutor;
}

export function resumenTexto(texto: string, max = 80): string {
  const plano = texto.replace(/\s+/g, ' ').trim();
  return plano.length <= max ? plano : `${plano.slice(0, max - 1).trimEnd()}…`;
}

/** La entrada que `entrada` corrige, o `null` si no corrige ninguna o no está en la lista. */
export function entradaCorregida(
  entradas: readonly EntradaBitacoraIncidente[],
  entrada: EntradaBitacoraIncidente,
): EntradaBitacoraIncidente | null {
  if (entrada.corrigeEntradaId === null) return null;
  return entradas.find((e) => e.id === entrada.corrigeEntradaId) ?? null;
}

/** Por qué no se puede escribir, o `null` si se puede. */
export function textoSoloLectura(bitacora: BitacoraIncidente): string | null {
  if (bitacora.puedeEscribir) return null;
  if (bitacora.estado === 'cerrado') return 'Incidente cerrado: la bitácora es de solo lectura.';
  if (!bitacora.esResponsable) {
    return `Solo ${bitacora.responsable.nombreResponsable} (responsable vigente) puede añadir entradas.`;
  }
  return null;
}

export type AgregarEntrada = (
  incidenteId: string,
  entrada: NuevaEntradaBitacora,
) => Promise<{ entrada: EntradaBitacoraIncidente }>;

export type ResultadoAgregarUi =
  | { tipo: 'agregada'; entrada: EntradaBitacoraIncidente }
  | { tipo: 'no_responsable'; responsable: ResponsableVigente | null }
  | { tipo: 'cerrado' }
  | { tipo: 'error'; mensaje: string; incierto: boolean };

type ErrorHttp = { status?: number; codigo?: string; extras?: Record<string, unknown>; message?: string };

/**
 * Un intento de añadir una entrada. El `operacionId` se conserva mientras no se sepa si el
 * servidor llegó a procesar la solicitud (error de red o 5xx), para que el reintento no
 * duplique la entrada; tras una respuesta definitiva se descarta.
 */
export async function intentarAgregarEntrada(
  incidenteId: string,
  gestor: GestorOperacion,
  agregar: AgregarEntrada,
  datos: { texto: string; corrigeEntradaId: string | null },
): Promise<ResultadoAgregarUi> {
  const operacionId = gestor.obtener();
  try {
    const { entrada } = await agregar(incidenteId, {
      operacionId,
      texto: datos.texto,
      corrigeEntradaId: datos.corrigeEntradaId,
    });
    gestor.resolver();
    return { tipo: 'agregada', entrada };
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
    const mensaje = e.message || 'No se pudo guardar la entrada.';
    if (esResultadoIncierto(error)) {
      // Se conserva el operacionId: el reintento no puede duplicar la entrada.
      return { tipo: 'error', mensaje, incierto: true };
    }
    gestor.resolver();
    return { tipo: 'error', mensaje, incierto: false };
  }
}
