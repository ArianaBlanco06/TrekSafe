import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPropiedadExpedicion } from '../../domain/repositories/IPropiedadExpedicion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Solo comprueba existencia y propietario; no lee ningún otro dato de la expedición. */
export class PropiedadExpedicionSupabase implements IPropiedadExpedicion {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from'>) {}

  async esPropietario(expedicionId: string, senderistaId: string): Promise<boolean> {
    const { data, error } = await this.cliente.from('expediciones')
      .select('id')
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) {
      throw new ErrorAplicacion(500, 'No se pudo consultar el historial de cambios.', 'HISTORIAL_CAMBIOS_NO_DISPONIBLE');
    }
    return data !== null;
  }
}
