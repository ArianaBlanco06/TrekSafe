import type { SupabaseClient } from '@supabase/supabase-js';
import type { IRescatistasDAO, RescatistaElegible } from '../../domain/repositories/IRescatistasDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

type FilaPerfil = { usuario_id: unknown; nombre_completo: unknown };

/**
 * Lista a los rescatistas validados. "Validado" significa lo mismo que en las RPC de relevo
 * (021): existe una fila en `perfiles_rescatista` (`treksafe_proponer_relevo`, paso 8, y
 * `treksafe_aceptar_relevo`, paso 9b, usan `EXISTS` sobre esa tabla; `validado_en` es NOT NULL,
 * así que no hay otro estado que filtrar). "Elegible" = validado y distinto del actor
 * (`DESTINATARIO_INVALIDO`). Columnas explícitas: solo id y nombre.
 */
export class RescatistasDAOSupabase implements IRescatistasDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from'>) {}

  async listarElegibles(excluirId: string): Promise<RescatistaElegible[]> {
    const { data, error } = await this.cliente
      .from('perfiles_rescatista')
      .select('usuario_id, nombre_completo')
      .neq('usuario_id', excluirId)
      .order('nombre_completo', { ascending: true });

    if (error) {
      console.error('[RescatistasDAOSupabase] listarElegibles:', error.message);
      throw new ErrorAplicacion(500, 'No se pudo consultar a los rescatistas');
    }

    return ((data ?? []) as FilaPerfil[])
      .filter((f) => typeof f.usuario_id === 'string' && typeof f.nombre_completo === 'string')
      .map((f) => ({ id: f.usuario_id as string, nombreCompleto: f.nombre_completo as string }));
  }
}
