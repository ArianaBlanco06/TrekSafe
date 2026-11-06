import { peticionApi } from './clienteApi';

/** Espejo de `historialCambios.dto.ts` del backend (HU-36). */
export type TipoCambioPlan = 'EDITADA' | 'CANCELADA' | 'RETORNO_AMPLIADO';
export type CampoCambioPlan =
  | 'lugarInicio'
  | 'lugarFin'
  | 'coordenadasInicio'
  | 'coordenadasFin'
  | 'horaInicio'
  | 'horaRetornoEstimada'
  | 'minutosTolerancia'
  | 'idsContactos'
  | 'nombresAcompanantes'
  | 'estado';
export type ValorCambioPlan = string | number | string[] | null;

export type CambioCampoHistorial = { campo: CampoCambioPlan; antes: ValorCambioPlan; despues: ValorCambioPlan };

export type EntradaHistorialCambios = {
  id: string;
  tipo: TipoCambioPlan;
  ocurridoEn: string;
  version: number;
  autor: { esPropietario: boolean };
  motivo: string | null;
  anonimizado: boolean;
  cambios: CambioCampoHistorial[];
};

export type HistorialCambiosPlan = { expedicionId: string; cambios: EntradaHistorialCambios[] };

/** Siempre en red y sin caché: el historial contiene datos personales. */
export function obtenerHistorialCambios(expedicionId: string): Promise<HistorialCambiosPlan> {
  return peticionApi<HistorialCambiosPlan>(
    `/expediciones/${encodeURIComponent(expedicionId)}/cambios`,
    { method: 'GET', cache: 'no-store' },
    true,
  );
}

/** Colaboradores de la pantalla; permite sustituir el transporte en pruebas. */
export interface FuentesHistorialCambios {
  obtener(expedicionId: string): Promise<HistorialCambiosPlan>;
}

export const fuentesHistorialCambios: FuentesHistorialCambios = {
  obtener: obtenerHistorialCambios,
};
