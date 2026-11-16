import type { SupabaseClient } from '@supabase/supabase-js';
import { ListaEquipo, type DatosListaEquipo, type EstadoListaEquipo } from '../../domain/entities/ListaEquipo.js';
import { ErrorValidacionEquipo, type CodigoErrorEquipo } from '../../domain/errors/ErrorValidacionEquipo.js';
import type { IListasEquipoDAO } from '../../domain/repositories/IListasEquipoDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

const codigosValidacion = new Set<CodigoErrorEquipo>([
  'NOMBRE_LISTA_INVALIDO', 'ITEM_INVALIDO', 'NOMBRE_ITEM_INVALIDO', 'OBLIGATORIO_INVALIDO',
  'ID_ITEM_INVALIDO', 'ITEMS_INVALIDOS', 'ITEM_DUPLICADO', 'ITEM_ID_NO_PERMITIDO', 'ITEM_NO_PERTENECE',
]);

export class RepositorioListasEquipoSupabase implements IListasEquipoDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'rpc'>) {}

  async listar(senderistaId: string): Promise<readonly ListaEquipo[]> {
    const datos = await this.ejecutar('treksafe_listar_listas_equipo', { p_senderista_id: senderistaId });
    return Object.freeze((datos as EstadoListaEquipo[]).map((estado) => new ListaEquipo(estado)));
  }

  async buscarPorId(senderistaId: string, listaId: string): Promise<ListaEquipo | null> {
    const datos = await this.ejecutar('treksafe_obtener_lista_equipo', {
      p_senderista_id: senderistaId, p_lista_id: listaId,
    });
    return datos === null ? null : new ListaEquipo(datos as EstadoListaEquipo);
  }

  async crear(senderistaId: string, entrada: DatosListaEquipo): Promise<ListaEquipo> {
    const datos = ListaEquipo.normalizarContenido(entrada);
    if (datos.items.some((item) => item.id !== undefined)) {
      throw new ErrorValidacionEquipo('ITEM_ID_NO_PERMITIDO', 'Los ítems nuevos no pueden incluir identificadores.');
    }
    const estado = await this.ejecutar('treksafe_crear_lista_equipo', {
      p_senderista_id: senderistaId, p_datos: datos,
    });
    return new ListaEquipo(estado as EstadoListaEquipo);
  }

  async actualizar(senderistaId: string, listaId: string, entrada: DatosListaEquipo): Promise<ListaEquipo | null> {
    // Mantiene null para listas ajenas y usa exactamente la normalización del dominio.
    if (!(await this.buscarPorId(senderistaId, listaId))) return null;
    const datos = ListaEquipo.normalizarContenido(entrada);
    // La RPC vuelve a comprobar propiedad y pertenencia bajo bloqueo: esta lectura no autoriza la escritura.
    const estado = await this.ejecutar('treksafe_actualizar_lista_equipo', {
      p_senderista_id: senderistaId, p_lista_id: listaId, p_datos: datos,
    });
    return estado === null ? null : new ListaEquipo(estado as EstadoListaEquipo);
  }

  async eliminar(senderistaId: string, listaId: string): Promise<boolean> {
    return (await this.ejecutar('treksafe_eliminar_lista_equipo', {
      p_senderista_id: senderistaId, p_lista_id: listaId,
    })) as boolean;
  }

  private async ejecutar(funcion: string, parametros: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.cliente.rpc(funcion, parametros);
    if (error) {
      const codigo = error.details as CodigoErrorEquipo;
      if (error.code === 'P0001' && codigosValidacion.has(codigo)) {
        throw new ErrorValidacionEquipo(codigo, error.message);
      }
      if (error.code === '23503') {
        throw new ErrorAplicacion(403, 'Se requiere un perfil de senderista vigente.', 'NO_ES_SENDERISTA');
      }
      throw new ErrorAplicacion(500, 'No se pudo completar la operación de equipo.', 'PERSISTENCIA_EQUIPO_FALLIDA');
    }
    return data;
  }
}
