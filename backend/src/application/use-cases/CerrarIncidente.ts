import {
  ErrorCierreIncidente,
  type CodigoErrorCierreIncidente,
} from '../../domain/errors/ErrorCierreIncidente.js';
import type { IRegistroCierreIncidente } from '../../domain/repositories/ICierreIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type { ComandoCerrarIncidente, ResultadoCierre } from '../commands/ComandoCerrarIncidente.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';

/** Ningún rechazo de negocio es 401: el frontend lo interpreta como sesión vencida. */
export const RESPUESTAS_CIERRE: Record<CodigoErrorCierreIncidente, { estado: number; mensaje: string }> = {
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de cierre inválidos' },
  NO_ES_RESPONSABLE: { estado: 403, mensaje: 'Solo el responsable vigente puede cerrar o actualizar el incidente' },
  INCIDENTE_NO_ENCONTRADO: { estado: 404, mensaje: 'Incidente no encontrado' },
  INCIDENTE_NO_LOCALIZADO: { estado: 409, mensaje: 'Solo se cierra un incidente con la persona localizada' },
  INCIDENTE_CERRADO: { estado: 409, mensaje: 'El incidente ya está cerrado' },
  OPERACION_YA_REGISTRADA: { estado: 409, mensaje: 'La operación ya se registró con otros datos' },
};

/** `responsableVigente` solo viaja en el 403. */
export function traducirErrorCierre(error: ErrorCierreIncidente): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS_CIERRE[error.codigo];
  return new ErrorAplicacion(
    estado,
    mensaje,
    error.codigo,
    error.responsableVigente ? { responsableVigente: error.responsableVigente } : undefined,
  );
}

/**
 * Ejecutor del comando `ComandoCerrarIncidente` (HU-42).
 *
 * Solo delega en `IRegistroCierreIncidente.cerrar`: la persistencia autoriza en una
 * transacción, contra el responsable vigente y con la fila del incidente bloqueada. Un
 * "¿es el responsable?" previo aquí sería una comprobación desfasada ante un relevo
 * concurrente. Aquí solo se traducen los rechazos de negocio a errores HTTP.
 */
export class CerrarIncidente implements IEjecutorComando<ComandoCerrarIncidente, ResultadoCierre> {
  constructor(private readonly registro: IRegistroCierreIncidente) {}

  async ejecutar(comando: ComandoCerrarIncidente): Promise<ResultadoCierre> {
    try {
      const { informe, repetido } = await this.registro.cerrar({
        comandoId: comando.comandoId,
        incidenteId: comando.incidenteId,
        rescatistaId: comando.rescatistaId,
        resultado: comando.resultado,
        resumen: comando.resumen,
      });
      return { tipo: repetido ? 'ya_cerrado_mismo_comando' : 'cerrado', informe };
    } catch (err) {
      if (err instanceof ErrorCierreIncidente) throw traducirErrorCierre(err);
      throw err;
    }
  }
}
