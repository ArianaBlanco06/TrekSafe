import type { EntradaCrearExpedicion } from '../dto/usuario.dto.js';

export type OrdenCrearPlan = Readonly<{
  senderistaId: string;
  borradorId: string;
  datos: EntradaCrearExpedicion;
}>;

export type PlanCreado = {
  id: string; lugarInicio: string; lugarFin: string; horaInicio: string;
  horaRetornoEstimada: string; minutosTolerancia: number; estado: string;
  version: number; creadoEn: string;
};

export interface ICreadorPlanIdempotente {
  crear(orden: OrdenCrearPlan): Promise<{ expedicion: PlanCreado; repetido: boolean }>;
}
