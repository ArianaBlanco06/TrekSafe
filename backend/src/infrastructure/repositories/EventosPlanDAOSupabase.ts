import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EventoPlan,
  IEventosPlanDAO,
  NuevoEventoPlan,
} from '../../domain/repositories/IEventosPlanDAO.js';
import { sanearCambios } from '../../domain/value-objects/camposEventoPlan.js';
import { esTipoEventoPlan, type TipoEventoPlan } from '../../domain/value-objects/tiposEventoPlan.js';
import {
  errorHistorialCambiosNoDisponible,
  errorOperacionYaRegistrada,
} from '../../shared/errors/erroresHistorialCambios.js';

type FilaEventoPlan = {
  id: string;
  expedicion_id: string;
  senderista_id: string;
  tipo: string;
  actor_id: string;
  ocurrido_en: string;
  version_resultante: number;
  cambios: unknown;
  motivo: string | null;
  operacion_id: string;
};

type FilaEventoPlanValida = FilaEventoPlan & { tipo: TipoEventoPlan };

/** Columnas explícitas: nunca `*`. */
const COLUMNAS = 'id, expedicion_id, senderista_id, tipo, actor_id, ocurrido_en, version_resultante, cambios, motivo, operacion_id';

function tieneTipoConocido(fila: FilaEventoPlan): fila is FilaEventoPlanValida {
  return esTipoEventoPlan(fila.tipo);
}

function aEvento(fila: FilaEventoPlanValida): EventoPlan {
  return {
    id: fila.id,
    expedicionId: fila.expedicion_id,
    senderistaId: fila.senderista_id,
    tipo: fila.tipo,
    actorId: fila.actor_id,
    ocurridoEn: fila.ocurrido_en,
    versionResultante: fila.version_resultante,
    // Defensa adicional al trigger de 010: lo que no esté en la lista blanca no sale.
    cambios: sanearCambios(fila.cambios),
    motivo: fila.motivo,
    operacionId: fila.operacion_id,
  };
}

/**
 * Lectura y registro de `eventos_plan`. Solo anexa: sin update, delete ni upsert.
 * Las RPC de HU-26, HU-27 y HU-35 siguen siendo quienes registran en producción.
 */
export class EventosPlanDAOSupabase implements IEventosPlanDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from'>) {}

  async listarPorExpedicion(senderistaId: string, expedicionId: string): Promise<EventoPlan[]> {
    const { data, error } = await this.cliente.from('eventos_plan')
      .select(COLUMNAS)
      .eq('expedicion_id', expedicionId)
      .eq('senderista_id', senderistaId)
      .order('ocurrido_en', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw errorHistorialCambiosNoDisponible();
    return ((data ?? []) as unknown as FilaEventoPlan[])
      .filter(tieneTipoConocido)
      .map(aEvento);
  }

  async registrar(evento: NuevoEventoPlan): Promise<EventoPlan> {
    const { data, error } = await this.cliente.from('eventos_plan')
      .insert({
        expedicion_id: evento.expedicionId,
        senderista_id: evento.senderistaId,
        tipo: evento.tipo,
        actor_id: evento.actorId,
        version_resultante: evento.versionResultante,
        cambios: sanearCambios(evento.cambios),
        motivo: evento.motivo,
        operacion_id: evento.operacionId,
      })
      .select(COLUMNAS)
      .single();

    if (error) {
      if (error.code === '23505') throw errorOperacionYaRegistrada();
      throw errorHistorialCambiosNoDisponible();
    }
    const fila = data as unknown as FilaEventoPlan;
    if (!tieneTipoConocido(fila)) throw errorHistorialCambiosNoDisponible();
    return aEvento(fila);
  }
}
