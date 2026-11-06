import { isoADatetimeLocal } from './fechaLocal';
import type {
  CampoCambioPlan,
  EntradaHistorialCambios,
  TipoCambioPlan,
  ValorCambioPlan,
} from '../services/historialCambios';

/** Presentación pura del historial de cambios (HU-36); sin React ni red. */

const ETIQUETAS_TIPO: Record<TipoCambioPlan, string> = {
  EDITADA: 'Edición',
  CANCELADA: 'Cancelación',
  RETORNO_AMPLIADO: 'Ampliación de retorno',
};

const ETIQUETAS_CAMPO: Record<CampoCambioPlan, string> = {
  lugarInicio: 'Punto de inicio',
  lugarFin: 'Destino',
  coordenadasInicio: 'Coordenadas de inicio',
  coordenadasFin: 'Coordenadas de destino',
  horaInicio: 'Hora de inicio',
  horaRetornoEstimada: 'Retorno estimado',
  minutosTolerancia: 'Tolerancia',
  idsContactos: 'Contactos de emergencia',
  nombresAcompanantes: 'Acompañantes',
  estado: 'Estado',
};

const ETIQUETAS_ESTADO: Record<string, string> = {
  programada: 'Programada',
  en_progreso: 'En progreso',
  completada: 'Completada',
  alerta: 'Alerta',
  cancelada: 'Cancelada',
};

export const SIN_VALOR = 'Sin valor';

export function etiquetaTipo(tipo: TipoCambioPlan): string {
  return ETIQUETAS_TIPO[tipo] ?? 'Cambio';
}

export function etiquetaCampo(campo: CampoCambioPlan): string {
  return ETIQUETAS_CAMPO[campo] ?? campo;
}

export function etiquetaAutor(autor: { esPropietario: boolean }): string {
  return autor.esPropietario ? 'Tú' : 'Otro usuario';
}

/** Fecha y hora local `AAAA-MM-DD HH:mm`, con la misma conversión que los formularios. */
export function formatearFecha(iso: string): string {
  const local = isoADatetimeLocal(iso);
  return local ? local.replace('T', ' ') : SIN_VALOR;
}

function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

/** Texto de un valor antes o después. Los contactos se muestran solo como cantidad. */
export function formatearValor(campo: CampoCambioPlan, valor: ValorCambioPlan): string {
  if (campo === 'idsContactos') {
    const cantidad = Array.isArray(valor) ? valor.length : 0;
    return plural(cantidad, 'contacto', 'contactos');
  }
  if (valor === null || valor === '') return SIN_VALOR;
  if (Array.isArray(valor)) return valor.length ? valor.join(', ') : 'Ninguno';
  if (campo === 'horaInicio' || campo === 'horaRetornoEstimada') {
    return typeof valor === 'string' ? formatearFecha(valor) : SIN_VALOR;
  }
  if (campo === 'minutosTolerancia') return `${valor} min`;
  if (campo === 'estado') return ETIQUETAS_ESTADO[String(valor)] ?? String(valor);
  return String(valor);
}

/** Minutos sumados en una ampliación de retorno, derivados de antes y después. */
export function minutosAmpliados(entrada: EntradaHistorialCambios): number | null {
  if (entrada.tipo !== 'RETORNO_AMPLIADO') return null;
  const cambio = entrada.cambios.find((c) => c.campo === 'horaRetornoEstimada');
  if (!cambio || typeof cambio.antes !== 'string' || typeof cambio.despues !== 'string') return null;
  const diferencia = Date.parse(cambio.despues) - Date.parse(cambio.antes);
  return Number.isFinite(diferencia) ? Math.round(diferencia / 60_000) : null;
}

export type FilaCambioPresentada = { campo: CampoCambioPlan; etiqueta: string; antes: string; despues: string };

export type EntradaPresentada = {
  id: string;
  titulo: string;
  fecha: string;
  autor: string;
  version: number;
  motivo: string | null;
  anonimizado: boolean;
  /** No anonimizado, pero sin filas, motivo ni ampliación que mostrar. */
  sinDetalle: boolean;
  detalleAmpliacion: string | null;
  filas: FilaCambioPresentada[];
};

export function presentarEntrada(entrada: EntradaHistorialCambios): EntradaPresentada {
  const minutos = minutosAmpliados(entrada);
  const detalleAmpliacion = minutos === null ? null : `+${plural(minutos, 'minuto', 'minutos')}`;
  return {
    id: entrada.id,
    titulo: etiquetaTipo(entrada.tipo),
    fecha: formatearFecha(entrada.ocurridoEn),
    autor: etiquetaAutor(entrada.autor),
    version: entrada.version,
    motivo: entrada.motivo,
    anonimizado: entrada.anonimizado,
    sinDetalle: !entrada.anonimizado && entrada.cambios.length === 0 && !entrada.motivo && detalleAmpliacion === null,
    detalleAmpliacion,
    filas: entrada.cambios.map((cambio) => ({
      campo: cambio.campo,
      etiqueta: etiquetaCampo(cambio.campo),
      antes: formatearValor(cambio.campo, cambio.antes),
      despues: formatearValor(cambio.campo, cambio.despues),
    })),
  };
}
