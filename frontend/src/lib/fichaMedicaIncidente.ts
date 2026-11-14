/**
 * Lógica pura de la ficha médica del incidente (HU-50): mensajes de rechazo y traducción de
 * errores. Los motivos deben coincidir con MOTIVOS_DENEGACION_FICHA del backend.
 */
export const MOTIVOS_DENEGACION_FICHA = [
  'NO_ES_RESCATISTA',
  'INCIDENTE_NO_ENCONTRADO',
  'INCIDENTE_CERRADO',
  'NO_ES_RESPONSABLE',
  'SIN_CONSENTIMIENTO',
  'CONTEXTO_CAMBIADO',
] as const;

export type MotivoDenegacionFicha = (typeof MOTIVOS_DENEGACION_FICHA)[number];

export const MENSAJES_DENEGACION_FICHA: Record<MotivoDenegacionFicha, string> = {
  NO_ES_RESPONSABLE: 'Solo el responsable vigente del incidente puede consultar la ficha médica.',
  INCIDENTE_CERRADO: 'El incidente está cerrado: la ficha médica ya no está disponible.',
  SIN_CONSENTIMIENTO: 'El senderista no tiene una ficha médica autorizada.',
  CONTEXTO_CAMBIADO: 'La coordinación cambió durante la consulta. Actualiza e inténtalo de nuevo.',
  INCIDENTE_NO_ENCONTRADO: 'El incidente ya no existe.',
  NO_ES_RESCATISTA: 'Tu perfil de rescatista no está validado.',
};

export const MENSAJE_SIN_CONEXION = 'Sin conexión: la ficha médica no se guarda para uso sin conexión.';
export const MENSAJE_AUDITORIA_NO_DISPONIBLE =
  'No se pudo registrar el acceso; la ficha no se mostró. Inténtalo de nuevo.';
export const MENSAJE_ERROR_GENERICO = 'No se pudo consultar la ficha médica.';
export const AVISO_CONSULTA_REGISTRADA = 'Cada consulta queda registrada.';
export const TEXTO_FICHA_SIN_COORDINACION =
  'La ficha médica solo está disponible para el responsable de un incidente abierto.';

const esMotivo = (valor: unknown): valor is MotivoDenegacionFicha =>
  typeof valor === 'string' && (MOTIVOS_DENEGACION_FICHA as readonly string[]).includes(valor);

/** Mensaje para el rescatista a partir de un error del cliente API (`{ status, extras?.motivo }`). */
export function mensajeErrorFicha(error: unknown): string {
  if (typeof error !== 'object' || error === null) return MENSAJE_ERROR_GENERICO;
  const { status, extras } = error as { status?: unknown; extras?: { motivo?: unknown } };
  if (status === 0) return MENSAJE_SIN_CONEXION;
  if (status === 503) return MENSAJE_AUDITORIA_NO_DISPONIBLE;
  const motivo = extras?.motivo;
  if (esMotivo(motivo)) return MENSAJES_DENEGACION_FICHA[motivo];
  return MENSAJE_ERROR_GENERICO;
}

/** Valor a mostrar de un campo de texto libre: vacío = "No declarada(s)". */
export function textoCampoFicha(valor: string, femenino: boolean): string {
  if (valor.trim().length > 0) return valor;
  return femenino ? 'No declarada' : 'No declaradas';
}
