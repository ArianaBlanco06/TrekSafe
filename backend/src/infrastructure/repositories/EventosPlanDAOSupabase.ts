import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoPlan, ILectorEventosPlan } from '../../domain/repositories/IEventosPlanDAO.js';
import { esEventoAnonimizado, sanearCambios } from '../../domain/value-objects/camposEventoPlan.js';
import { esTipoEventoPlan, type TipoEventoPlan } from '../../domain/value-objects/tiposEventoPlan.js';
import { errorHistorialCambiosNoDisponible } from '../../shared/errors/erroresHistorialCambios.js';

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
export const COLUMNAS_EVENTO_PLAN =
  'id, expedicion_id, senderista_id, tipo, actor_id, ocurrido_en, version_resultante, cambios, motivo, operacion_id';

function tieneTipoConocido(fila: FilaEventoPlan): fila is FilaEventoPlanValida {
  return esTipoEventoPlan(fila.tipo);
}

/** PostgREST devuelve `timestamptz` con microsegundos y desfase; se normaliza a ISO en ms y UTC. */
function aIsoCanonico(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) throw errorHistorialCambiosNoDisponible();
  return fecha.toISOString();
}

function aEvento(fila: FilaEventoPlanValida): EventoPlan {
  return {
    id: fila.id,
    expedicionId: fila.expedicion_id,
    senderistaId: fila.senderista_id,
    tipo: fila.tipo,
    actorId: fila.actor_id,
    ocurridoEn: aIsoCanonico(fila.ocurrido_en),
    versionResultante: fila.version_resultante,
    // Defensa adicional al trigger de 010: lo que no esté en la lista blanca no sale.
    cambios: sanearCambios(fila.cambios),
    motivo: fila.motivo,
    operacionId: fila.operacion_id,
    anonimizado: esEventoAnonimizado(fila.cambios, fila.motivo),
  };
}

/**
 * Solo lectura de `eventos_plan`.
 * En Supabase registran las RPC 003/005/007 en la misma transacción que suben la versión;
 * no hay escritura desde TS.
 */
export class EventosPlanDAOSupabase implements ILectorEventosPlan {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from'>) {}

  async listarPorExpedicion(senderistaId: string, expedicionId: string): Promise<EventoPlan[]> {
    const { data, error } = await this.cliente.from('eventos_plan')
      .select(COLUMNAS_EVENTO_PLAN)
      .eq('expedicion_id', expedicionId)
      .eq('senderista_id', senderistaId)
      .order('ocurrido_en', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw errorHistorialCambiosNoDisponible();
    return ((data ?? []) as unknown as FilaEventoPlan[])
      .filter(tieneTipoConocido)
      .map(aEvento);
  }
}
