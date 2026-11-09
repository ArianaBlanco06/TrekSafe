import type { PlanExpedicion } from '../../domain/repositories/IExpedicionDAO.js';
import type { RutaConPuntos } from '../../domain/entities/RutaConPuntos.js';
import type { PreparacionExpedicion } from '../../domain/entities/PreparacionExpedicion.js';

/** Puertos de lectura HU-33; no dependen de las operaciones de escritura. */
export interface ILectorPlan {
  obtenerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion | null>;
}
export interface ILectorPuntos {
  consultarPropia(senderistaId: string, expedicionId: string): Promise<RutaConPuntos | null>;
}
export interface ILectorPreparacion {
  obtenerPreparacion(senderistaId: string, expedicionId: string): Promise<PreparacionExpedicion | null>;
}
