import type { CambiosEventoPlan } from '../value-objects/camposEventoPlan.js';
import type { TipoEventoPlan } from '../value-objects/tiposEventoPlan.js';

export type { TipoEventoPlan };

/** Fila de `eventos_plan` ya saneada. Nunca contiene contraseñas ni datos médicos. */
export type EventoPlan = {
  readonly id: string;
  readonly expedicionId: string;
  readonly senderistaId: string;
  readonly tipo: TipoEventoPlan;
  readonly actorId: string;
  readonly ocurridoEn: string;
  readonly versionResultante: number;
  readonly cambios: CambiosEventoPlan;
  readonly motivo: string | null;
  readonly operacionId: string;
};

/** `id` y `ocurridoEn` los asigna la persistencia, nunca quien registra. */
export type NuevoEventoPlan = Omit<EventoPlan, 'id' | 'ocurridoEn'>;

/** Lectura del historial (HU-36). Las implementaciones filtran siempre por propietario. */
export interface ILectorEventosPlan {
  /** Eventos propios en orden cronológico ascendente (`ocurridoEn`, `id`). */
  listarPorExpedicion(senderistaId: string, expedicionId: string): Promise<EventoPlan[]>;
}

/** Solo anexar: no existe actualización ni eliminación de eventos. */
export interface IRegistroEventosPlan {
  /** Rechaza un `operacionId` ya registrado sin sobrescribir el evento existente. */
  registrar(evento: NuevoEventoPlan): Promise<EventoPlan>;
}

export interface IEventosPlanDAO extends ILectorEventosPlan, IRegistroEventosPlan {}
