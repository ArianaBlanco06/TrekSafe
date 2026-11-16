/** Rescatista validado al que se puede proponer un relevo. Solo identidad: sin datos médicos ni de contacto. */
export type RescatistaElegible = {
  id: string;
  nombreCompleto: string;
};

/**
 * Consulta de rescatistas validados para elegir destinatario de un relevo (HU-40).
 * Interfaz aparte (segregación de interfaces): no mezcla lectura de catálogo con coordinación.
 */
export interface IRescatistasDAO {
  /** Rescatistas validados distintos de `excluirId`, ordenados por nombre. */
  listarElegibles(excluirId: string): Promise<RescatistaElegible[]>;
}
