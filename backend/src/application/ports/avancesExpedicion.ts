import type { AvanceExpedicion } from '../../domain/entities/AvanceExpedicion.js';

export type OrdenRegistrarAvance = Readonly<{
  senderistaId: string; expedicionId: string; solicitudId: string; puntoId: string; nota: string | null;
}>;
export type ResultadoRegistroAvance =
  | { tipo: 'registrado' | 'repetido'; avance: AvanceExpedicion }
  | { tipo: 'no_encontrado' | 'estado_no_admitido' | 'punto_no_disponible' | 'solicitud_reutilizada' | 'datos_invalidos' };
export type ResultadoConsultaAvance =
  | { tipo: 'no_encontrado' }
  | { tipo: 'consultado'; ultimoAvance: AvanceExpedicion | null };
export interface IRegistroAvances {
  registrarPropio(orden: OrdenRegistrarAvance): Promise<ResultadoRegistroAvance>;
}
export interface IConsultaAvances {
  consultarUltimoPropio(senderistaId: string, expedicionId: string): Promise<ResultadoConsultaAvance>;
}
