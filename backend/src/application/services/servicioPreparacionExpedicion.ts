import { ItemPreparacion } from '../../domain/entities/ItemPreparacion.js';
import type { PreparacionExpedicion } from '../../domain/entities/PreparacionExpedicion.js';
import { ErrorPreparacionExpedicion } from '../../domain/errors/ErrorPreparacionExpedicion.js';
import type { IPreparacionExpedicionDAO } from '../../domain/repositories/IPreparacionExpedicionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Coordina el puerto inyectado. La escritura atómica es responsabilidad del DAO. */
export class ServicioPreparacionExpedicion {
  constructor(private readonly dao: IPreparacionExpedicionDAO) {}

  async obtenerPreparacion(senderistaId: string, expedicionId: string): Promise<PreparacionExpedicion | null> {
    return this.ejecutar(senderistaId, expedicionId, () => this.dao.obtener(senderistaId, expedicionId));
  }

  async asociarLista(senderistaId: string, expedicionId: string, listaId: string): Promise<PreparacionExpedicion> {
    return this.ejecutar(senderistaId, expedicionId, () => this.dao.asociarLista(senderistaId, expedicionId, listaId));
  }

  async establecerPreparado(
    senderistaId: string,
    expedicionId: string,
    itemId: string,
    preparado: boolean,
  ): Promise<PreparacionExpedicion> {
    return this.ejecutar(senderistaId, expedicionId, () => {
      ItemPreparacion.validarPreparado(preparado);
      return this.dao.establecerPreparado(senderistaId, expedicionId, itemId, preparado);
    });
  }

  private async ejecutar<T extends PreparacionExpedicion | null>(
    senderistaId: string,
    expedicionId: string,
    operacion: () => Promise<T>,
  ): Promise<T> {
    if (typeof senderistaId !== 'string' || !senderistaId.trim()) {
      throw new ErrorAplicacion(401, 'Se requiere un senderista autenticado.', 'NO_AUTORIZADO');
    }
    try {
      const resultado = await operacion();
      if (resultado && (resultado.senderistaId !== senderistaId || resultado.expedicionId !== expedicionId)) {
        throw new ErrorAplicacion(404, 'Expedición no encontrada.', 'EXPEDICION_NO_ENCONTRADA');
      }
      return resultado;
    } catch (error) {
      if (error instanceof ErrorPreparacionExpedicion) {
        switch (error.codigo) {
          case 'EXPEDICION_NO_ENCONTRADA':
          case 'LISTA_EQUIPO_NO_ENCONTRADA':
          case 'ITEM_PREPARACION_NO_ENCONTRADO':
            throw new ErrorAplicacion(404, error.message, error.codigo);
          case 'PREPARACION_YA_ASOCIADA':
          case 'PREPARACION_NO_EDITABLE':
            throw new ErrorAplicacion(409, error.message, error.codigo);
          case 'PREPARADO_INVALIDO':
            throw new ErrorAplicacion(400, error.message, error.codigo);
        }
      }
      throw error;
    }
  }
}
