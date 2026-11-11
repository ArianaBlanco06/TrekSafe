import type { ILectorBitacoraIncidente } from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import { admiteEntradas } from '../../domain/value-objects/entradaBitacora.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { aVistaEntrada, consultarBitacoraSchema, type BitacoraIncidenteVista } from '../dto/bitacoraIncidente.dto.js';

/**
 * Lectura de la bitácora de un incidente (HU-41, CA-03): cualquier rescatista autorizado
 * la ve, en cualquier estado del incidente y en el orden que fija el servidor.
 * El cliente no reordena ni recibe datos médicos (la vista solo conoce nombres y textos).
 */
export class ConsultarBitacoraIncidente {
  constructor(private readonly lector: ILectorBitacoraIncidente) {}

  /**
   * @throws ZodError (400) si los id no son UUID.
   * @throws ErrorAplicacion 404 INCIDENTE_NO_ENCONTRADO si el incidente no existe.
   */
  async ejecutar(rescatistaId: string, incidenteId: string): Promise<BitacoraIncidenteVista> {
    const datos = consultarBitacoraSchema.parse({ rescatistaId, incidenteId });
    const bitacora = await this.lector.listar(datos.incidenteId);
    if (!bitacora) throw new ErrorAplicacion(404, 'Incidente no encontrado', 'INCIDENTE_NO_ENCONTRADO');

    const { incidente } = bitacora;
    const esResponsable = incidente.responsableId === datos.rescatistaId;
    return {
      incidenteId: incidente.id,
      expedicionId: incidente.expedicionId,
      estado: incidente.estado,
      responsable: { responsableId: incidente.responsableId, nombreResponsable: incidente.nombreResponsable },
      esResponsable,
      // Solo una pista para la UI: la RPC vuelve a autorizar con la fila bloqueada.
      puedeEscribir: esResponsable && admiteEntradas(incidente.estado),
      entradas: bitacora.entradas.map((e) => aVistaEntrada(e, datos.rescatistaId)),
    };
  }
}
