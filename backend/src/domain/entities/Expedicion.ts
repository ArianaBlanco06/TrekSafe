import type { EstadoExpedicion } from '../value-objects/enums.js';

export type Expedicion = {
  id: string;
  senderistaId: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  estado: EstadoExpedicion;
  creadoEn?: string;
  actualizadoEn?: string;
};

export function calcularFechaLimite(
  horaRetornoEstimada: string,
  minutosTolerancia: number,
): string {
  return new Date(
    new Date(horaRetornoEstimada).getTime() + minutosTolerancia * 60_000,
  ).toISOString();
}
