import { randomUUID } from 'node:crypto';
import type { EventoPlan, IEventosPlanDAO, NuevoEventoPlan } from '../../../domain/repositories/IEventosPlanDAO.js';
import type { IReloj } from '../../../domain/services/IReloj.js';
import { esEventoAnonimizado, sanearCambios } from '../../../domain/value-objects/camposEventoPlan.js';
import { errorOperacionYaRegistrada } from '../../../shared/errors/erroresHistorialCambios.js';
import { RelojSistema } from '../../services/RelojSistema.js';

function copiar(evento: EventoPlan): EventoPlan {
  return { ...evento, cambios: sanearCambios(evento.cambios) };
}

/**
 * Sustituto con la semántica de `eventos_plan` tras la migración 012: solo anexa,
 * sanea `cambios`, fija `ocurridoEn` con su reloj y rechaza `operacionId` repetidos.
 */
export class EventosPlanDAOMemoria implements IEventosPlanDAO {
  private readonly eventos: EventoPlan[] = [];

  constructor(
    private readonly reloj: IReloj = new RelojSistema(),
    private readonly generarId: () => string = randomUUID,
  ) {}

  async registrar(evento: NuevoEventoPlan): Promise<EventoPlan> {
    if (this.eventos.some((existente) => existente.operacionId === evento.operacionId)) {
      throw errorOperacionYaRegistrada();
    }
    const registrado: EventoPlan = {
      id: this.generarId(),
      expedicionId: evento.expedicionId,
      senderistaId: evento.senderistaId,
      tipo: evento.tipo,
      actorId: evento.actorId,
      ocurridoEn: this.reloj.ahora().toISOString(),
      versionResultante: evento.versionResultante,
      cambios: sanearCambios(evento.cambios),
      motivo: evento.motivo,
      operacionId: evento.operacionId,
      // Antes de sanear: un evento cuyos campos se descartan no queda como anonimizado.
      anonimizado: esEventoAnonimizado(evento.cambios, evento.motivo),
    };
    this.eventos.push(registrado);
    return copiar(registrado);
  }

  async listarPorExpedicion(senderistaId: string, expedicionId: string): Promise<EventoPlan[]> {
    return this.eventos
      .filter((evento) => evento.expedicionId === expedicionId && evento.senderistaId === senderistaId)
      .sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn) || a.id.localeCompare(b.id))
      .map(copiar);
  }
}
