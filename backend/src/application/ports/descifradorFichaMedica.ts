import type { CargaUtilMedica } from '../../domain/value-objects/CargaUtilMedica.js';

/** Puerto de descifrado: la aplicación no conoce el algoritmo ni la clave. */
export interface IDescifradorFichaMedica {
  descifrar(cargaCifrada: string): CargaUtilMedica;
}
