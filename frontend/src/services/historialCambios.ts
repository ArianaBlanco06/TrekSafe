import { peticionApi } from './clienteApi';

/**
 * Espejo de `historialCambios.dto.ts` del backend (HU-36). Las dos listas deben coincidir
 * con TIPOS_EVENTO_PLAN y CAMPOS_EVENTO_PLAN del backend; sus pruebas lo comprueban.
 */
export const TIPOS_CAMBIO_PLAN = ['EDITADA', 'CANCELADA', 'RETORNO_AMPLIADO'] as const;
export const CAMPOS_CAMBIO_PLAN = [
  'lugarInicio',
  'lugarFin',
  'coordenadasInicio',
  'coordenadasFin',
  'horaInicio',
  'horaRetornoEstimada',
  'minutosTolerancia',
  'idsContactos',
  'nombresAcompanantes',
  'estado',
] as const;

export type TipoCambioPlan = (typeof TIPOS_CAMBIO_PLAN)[number];
export type CampoCambioPlan = (typeof CAMPOS_CAMBIO_PLAN)[number];
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
