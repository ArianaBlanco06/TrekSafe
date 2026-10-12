import type { EstadoRescate } from '../value-objects/enums.js';

export type BitacoraRescate = {
  id: string;
  expedicionId: string;
  rescatistaId: string;
  notas: string | null;
  estadoRescate: EstadoRescate;
  actualizadoEn: string;
};
