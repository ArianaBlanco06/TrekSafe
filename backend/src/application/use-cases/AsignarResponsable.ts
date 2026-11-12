import {
  ErrorCoordinacion,
  type CodigoErrorCoordinacion,
} from '../../domain/errors/ErrorCoordinacion.js';
import type { IIncidenteDAO } from '../../domain/repositories/IIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  ComandoAsignarResponsable,
  ResultadoAsignarResponsable,
} from '../commands/ComandoAsignarResponsable.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';

/** Ningún rechazo de negocio es 401: el frontend lo interpreta como sesión vencida. */
export const RESPUESTAS_COORDINACION: Record<
  CodigoErrorCoordinacion,
  { estado: number; mensaje: string }
> = {
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de entrada inválidos' },
  NO_ES_RESCATISTA: { estado: 403, mensaje: 'Solo un rescatista validado puede asumir una coordinación' },
  ALERTA_NO_ENCONTRADA: {
    estado: 404,
    mensaje: 'Alerta no encontrada o la expedición ya no está en alerta',
  },
  COORDINACION_YA_ASUMIDA: {
    estado: 409,
    mensaje: 'Otro rescatista ya coordina esta alerta',
  },
};

function traducir(error: ErrorCoordinacion): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS_COORDINACION[error.codigo];
  return new ErrorAplicacion(
    estado,
    mensaje,
    error.codigo,
    error.responsableVigente ? { responsableVigente: error.responsableVigente } : undefined,
  );
}

/**
 * Ejecutor del comando `ComandoAsignarResponsable` (HU-39).
 *
 * Solo delega en `IIncidenteDAO.asumir`: la persistencia resuelve en una transacción,
 * con la expedición bloqueada, las reglas, la idempotencia por `operacionId` y el único
 * responsable por alerta. Repetir esas reglas aquí no protegería nada frente a la
 * concurrencia. Aquí solo se traducen los rechazos de negocio a errores HTTP.
 *
 * Es independiente de la recepción histórica de HU-14 (`confirmarAlerta`).
 */
export class AsignarResponsable
  implements IEjecutorComando<ComandoAsignarResponsable, ResultadoAsignarResponsable>
{
  constructor(private readonly dao: IIncidenteDAO) {}

  async ejecutar(comando: ComandoAsignarResponsable): Promise<ResultadoAsignarResponsable> {
    try {
      return await this.dao.asumir({
        expedicionId: comando.expedicionId,
        rescatistaId: comando.rescatistaId,
        operacionId: comando.operacionId,
      });
    } catch (err) {
      if (err instanceof ErrorCoordinacion) throw traducir(err);
      throw err;
    }
  }
}
