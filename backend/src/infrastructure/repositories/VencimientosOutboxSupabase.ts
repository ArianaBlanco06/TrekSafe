import type {
  IVencimientosOutbox,
  ResultadoVencimientosOutbox,
} from '../../application/ports/vencimientosOutbox.js';
import { getSupabaseAdmin } from '../database/supabase.js';

export class VencimientosOutboxSupabase implements IVencimientosOutbox {
  constructor(private readonly supabase = getSupabaseAdmin()) {}

  async evaluar(limite: number): Promise<ResultadoVencimientosOutbox> {
    const { data, error } = await this.supabase.rpc(
      'treksafe_evaluar_vencimientos_con_outbox',
      { p_limite: limite },
    );
    if (error) throw new Error('VENCIMIENTOS_PERSISTENCIA_NO_DISPONIBLE');
    if (
      !data || !Number.isInteger(data.enAlerta) || data.enAlerta < 0 ||
      !Number.isInteger(data.pendientes) || data.pendientes < 0 ||
      !Array.isArray(data.sinDestinatarios) ||
      !data.sinDestinatarios.every((id: unknown) => typeof id === 'string')
    ) throw new Error('VENCIMIENTOS_RESPUESTA_INVALIDA');
    return {
      enAlerta: data.enAlerta,
      pendientes: data.pendientes,
      sinDestinatarios: data.sinDestinatarios,
    };
  }
}
