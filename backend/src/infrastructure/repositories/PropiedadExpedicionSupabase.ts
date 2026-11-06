import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPropiedadExpedicion } from '../../domain/repositories/IPropiedadExpedicion.js';
import { errorHistorialCambiosNoDisponible } from '../../shared/errors/erroresHistorialCambios.js';

/** Solo comprueba existencia y propietario; no lee ningún otro dato de la expedición. */
export class PropiedadExpedicionSupabase implements IPropiedadExpedicion {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from'>) {}

  async esPropietario(senderistaId: string, expedicionId: string): Promise<boolean> {
    const { data, error } = await this.cliente.from('expediciones')
      .select('id')
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw errorHistorialCambiosNoDisponible();
    return data !== null;
  }
}
