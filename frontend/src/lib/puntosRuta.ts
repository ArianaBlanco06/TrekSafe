import type { PuntoRuta } from '@/services/puntosRuta';
import { isValidPeruLatitude, isValidPeruLongitude } from './coordinates';

export const MAX_PUNTOS_RUTA = 20;

/** Copia independiente para HU-28; conserva la ruta y genera identidades nuevas. */
export function copiarPuntosParaPlanNuevo(
  puntos: readonly PuntoRuta[],
  nuevoId: () => string = () => crypto.randomUUID(),
): PuntoRuta[] {
  return [...puntos].sort((a, b) => a.orden - b.orden).map((punto, indice) => ({
    id: nuevoId(),
    nombre: punto.nombre,
    latitud: punto.latitud,
    longitud: punto.longitud,
    orden: indice + 1,
  }));
}

// Las cadenas permiten conservar entradas vacias o incompletas mientras se edita.
export type PuntoEditable = {
  id: string;
  nombre: string;
  latitud: string;
  longitud: string;
};
export type ErroresPuntos = Record<string, string[]>;

export function editarPuntos(puntos: PuntoRuta[]): PuntoEditable[] {
  return [...puntos].sort((a, b) => a.orden - b.orden).map(punto => ({
    id: punto.id, nombre: punto.nombre, latitud: String(punto.latitud), longitud: String(punto.longitud),
  }));
}

export function nuevoPunto(): PuntoEditable {
  return { id: crypto.randomUUID(), nombre: '', latitud: '', longitud: '' };
}

function numeroDecimal(texto: string): number | null {
  // Aceptar coma decimal al escribir; el contrato HTTP recibe numeros.
  const valor = texto.trim().replace(',', '.');
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export function validarPuntosEditables(editables: PuntoEditable[]): {
  puntos: PuntoRuta[];
  errores: ErroresPuntos;
} {
  const errores: ErroresPuntos = {};
  if (editables.length > MAX_PUNTOS_RUTA) errores.puntos = ['Se permiten hasta 20 puntos'];
  const puntos = editables.map((punto, indice) => {
    const prefijo = `puntos.${indice}`;
    const nombre = punto.nombre.trim();
    const caracteres = Array.from(nombre);
    if (caracteres.length < 1 || caracteres.length > 100) {
      errores[`${prefijo}.nombre`] = ['Escribe un nombre de entre 1 y 100 caracteres'];
    } else if (caracteres.some(c => c.codePointAt(0) === 0 || /^[\uD800-\uDFFF]$/.test(c))) {
      errores[`${prefijo}.nombre`] = ['El nombre contiene caracteres no válidos'];
    }
    const latitud = numeroDecimal(punto.latitud);
    const longitud = numeroDecimal(punto.longitud);
    if (latitud === null || !isValidPeruLatitude(latitud)) {
      errores[`${prefijo}.latitud`] = ['Escribe una latitud entre -18.5 y 0.5'];
    }
    if (longitud === null || !isValidPeruLongitude(longitud)) {
      errores[`${prefijo}.longitud`] = ['Escribe una longitud entre -81.5 y -68.5'];
    }
    return { id: punto.id, nombre, latitud: latitud ?? 0, longitud: longitud ?? 0, orden: indice + 1 };
  });
  return { puntos, errores };
}
