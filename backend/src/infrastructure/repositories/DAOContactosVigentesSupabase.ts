import type { SupabaseClient } from '@supabase/supabase-js';
import type { IContactosVigentes } from '../../domain/repositories/IContactosVigentes.js';
import { getSupabaseAdmin } from '../database/supabase.js';

export class DAOContactosVigentesSupabase implements IContactosVigentes {
  constructor(private readonly supabase: SupabaseClient = getSupabaseAdmin()) {}

  async filtrarVigentes(senderistaId: string, idsContactos: readonly string[]): Promise<string[]> {
    if (idsContactos.length === 0) return [];

    const { data, error } = await this.supabase
      .from('contactos_emergencia')
      .select('id')
      .eq('senderista_id', senderistaId)
      .in('id', [...idsContactos]);

    if (error) throw new Error(error.message);
    const existentes = new Set((data ?? []).map((fila: { id: string }) => fila.id));
    return idsContactos.filter((id) => existentes.has(id));
  }
}
