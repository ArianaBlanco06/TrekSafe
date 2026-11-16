import type { SupabaseClient } from '@supabase/supabase-js';
import { ItemPreparacion } from '../../domain/entities/ItemPreparacion.js';
import { PreparacionExpedicion, type EstadoPreparacionExpedicion } from '../../domain/entities/PreparacionExpedicion.js';
import { ErrorPreparacionExpedicion, type CodigoErrorPreparacionExpedicion } from '../../domain/errors/ErrorPreparacionExpedicion.js';
import type { IPreparacionExpedicionDAO } from '../../domain/repositories/IPreparacionExpedicionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

const mensajes = {
  EXPEDICION_NO_ENCONTRADA: 'Expedición no encontrada.',
  LISTA_EQUIPO_NO_ENCONTRADA: 'Lista de equipo no encontrada.',
  ITEM_PREPARACION_NO_ENCONTRADO: 'Ítem de preparación no encontrado.',
  PREPARACION_YA_ASOCIADA: 'La expedición ya tiene una lista de equipo asociada.',
  PREPARACION_NO_EDITABLE: 'Solo puedes preparar el equipo de una expedición programada o en progreso.',
  PREPARADO_INVALIDO: 'La marca de equipo preparado debe ser booleana.',
} satisfies Partial<Record<CodigoErrorPreparacionExpedicion, string>>;

/** Traduce el puerto a RPC. Las comprobaciones definitivas se realizan bajo bloqueo en SQL. */
export class RepositorioPreparacionExpedicionSupabase implements IPreparacionExpedicionDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'rpc'>) {}

  async obtener(senderistaId: string, expedicionId: string): Promise<PreparacionExpedicion | null> {
    return this.ejecutar('treksafe_obtener_preparacion', {
      p_senderista_id: senderistaId, p_expedicion_id: expedicionId,
    });
  }

  async asociarLista(senderistaId: string, expedicionId: string, listaId: string): Promise<PreparacionExpedicion> {
    const resultado = await this.ejecutar('treksafe_asociar_lista_expedicion', {
      p_senderista_id: senderistaId, p_expedicion_id: expedicionId, p_lista_id: listaId,
    });
    if (!resultado) throw this.errorPersistencia();
    return resultado;
  }

  async establecerPreparado(
    senderistaId: string, expedicionId: string, itemId: string, preparado: boolean,
  ): Promise<PreparacionExpedicion> {
    ItemPreparacion.validarPreparado(preparado);
    const resultado = await this.ejecutar('treksafe_establecer_item_preparado', {
      p_senderista_id: senderistaId, p_expedicion_id: expedicionId, p_item_id: itemId, p_preparado: preparado,
    });
    if (!resultado) throw this.errorPersistencia();
    return resultado;
  }

  private async ejecutar(nombre: string, parametros: Record<string, unknown>): Promise<PreparacionExpedicion | null> {
    let respuesta;
    try {
      respuesta = await this.cliente.rpc(nombre, parametros);
    } catch {
      throw this.errorPersistencia();
    }
    const { data, error } = respuesta;
    if (error) {
      const codigo = error.details as keyof typeof mensajes;
      if (error.code === 'P0001' && Object.hasOwn(mensajes, codigo)) {
        throw new ErrorPreparacionExpedicion(codigo, mensajes[codigo]);
      }
      throw this.errorPersistencia();
    }
    if (data === null) return null;
    try {
      return new PreparacionExpedicion(data as EstadoPreparacionExpedicion);
    } catch {
      throw this.errorPersistencia();
    }
  }

  private errorPersistencia(): ErrorAplicacion {
    return new ErrorAplicacion(500, 'No se pudo completar la operación de preparación.', 'PERSISTENCIA_PREPARACION_FALLIDA');
  }
}
