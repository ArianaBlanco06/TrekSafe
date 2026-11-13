import type { IDescifradorFichaMedica } from '../../application/ports/descifradorFichaMedica.js';
import type { CargaUtilMedica } from '../../domain/value-objects/CargaUtilMedica.js';
import { desencriptarCargaUtilMedica } from './encryption.js';

/** Adaptador AES-256-GCM del puerto de descifrado; no cambia ni el algoritmo ni la clave. */
export class DescifradorFichaMedicaAesGcm implements IDescifradorFichaMedica {
  descifrar(cargaCifrada: string): CargaUtilMedica {
    return desencriptarCargaUtilMedica(cargaCifrada);
  }
}
