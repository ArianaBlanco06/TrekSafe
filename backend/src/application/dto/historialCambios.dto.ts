import type { EventoPlan, TipoEventoPlan } from '../../domain/repositories/IEventosPlanDAO.js';
import { CAMPOS_EVENTO_PLAN, type CampoEventoPlan, type ValorCambio } from '../../domain/value-objects/camposEventoPlan.js';

export type CambioCampoHistorial = {
  campo: CampoEventoPlan;
  antes: ValorCambio;
  despues: ValorCambio;
};

/** Una entrada del historial (HU-36). Sin operacionId, senderistaId ni actorId. */
export type EntradaHistorialCambios = {
  id: string;
  tipo: TipoEventoPlan;
  ocurridoEn: string;
  version: number;
  autor: { esPropietario: boolean };
  motivo: string | null;
  /** true si la anonimización ARCO vació los datos del evento. */
  anonimizado: boolean;
  cambios: CambioCampoHistorial[];
};

export type HistorialCambiosPlan = {
  expedicionId: string;
  cambios: EntradaHistorialCambios[];
};

/** Proyección explícita (sin spread): solo salen los campos de la respuesta pública. */
export function aEntradaHistorialCambios(evento: EventoPlan, solicitanteId: string): EntradaHistorialCambios {
  const cambios: CambioCampoHistorial[] = [];
  for (const campo of CAMPOS_EVENTO_PLAN) {
    const cambio = evento.cambios[campo];
    if (cambio) cambios.push({ campo, antes: cambio.antes, despues: cambio.despues });
  }
  return {
    id: evento.id,
    tipo: evento.tipo,
    ocurridoEn: evento.ocurridoEn,
    version: evento.versionResultante,
    autor: { esPropietario: evento.actorId === solicitanteId },
    motivo: evento.motivo,
    anonimizado: cambios.length === 0 && evento.motivo === null,
    cambios,
  };
}
