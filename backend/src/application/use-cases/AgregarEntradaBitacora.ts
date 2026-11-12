import {
  ErrorBitacoraIncidente,
  type CodigoErrorBitacoraIncidente,
} from '../../domain/errors/ErrorBitacoraIncidente.js';
import type { IRegistroBitacoraIncidente } from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  ComandoAgregarEntradaBitacora,
  ResultadoAgregarEntradaBitacora,
} from '../commands/ComandoAgregarEntradaBitacora.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';

/** Ningún rechazo de negocio es 401: el frontend lo interpreta como sesión vencida. */
export const RESPUESTAS_BITACORA: Record<CodigoErrorBitacoraIncidente, { estado: number; mensaje: string }> = {
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de entrada inválidos' },
  CORRECCION_INVALIDA: { estado: 400, mensaje: 'La entrada a corregir no pertenece a este incidente' },
  NO_ES_RESPONSABLE: { estado: 403, mensaje: 'Solo el responsable vigente puede añadir entradas a la bitácora' },
  INCIDENTE_NO_ENCONTRADO: { estado: 404, mensaje: 'Incidente no encontrado' },
  INCIDENTE_CERRADO: { estado: 409, mensaje: 'El incidente está cerrado: la bitácora es de solo lectura' },
  OPERACION_YA_REGISTRADA: { estado: 409, mensaje: 'La operación ya se registró con otros datos' },
};

function traducir(error: ErrorBitacoraIncidente): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS_BITACORA[error.codigo];
  return new ErrorAplicacion(
    estado,
    mensaje,
    error.codigo,
    error.responsableVigente ? { responsableVigente: error.responsableVigente } : undefined,
  );
}

/**
 * Ejecutor del comando `ComandoAgregarEntradaBitacora` (HU-41).
 *
 * Solo delega en `IRegistroBitacoraIncidente.agregar`: la persistencia autoriza en una
 * transacción, contra el responsable vigente y con la fila del incidente bloqueada. Un
 * "¿es el responsable?" previo aquí sería una comprobación desfasada ante un relevo
 * concurrente. Aquí solo se traducen los rechazos de negocio a errores HTTP.
 */
export class AgregarEntradaBitacora
  implements IEjecutorComando<ComandoAgregarEntradaBitacora, ResultadoAgregarEntradaBitacora>
{
  constructor(private readonly registro: IRegistroBitacoraIncidente) {}

  async ejecutar(comando: ComandoAgregarEntradaBitacora): Promise<ResultadoAgregarEntradaBitacora> {
    try {
      return await this.registro.agregar({
        incidenteId: comando.incidenteId,
        autorId: comando.autorId,
        texto: comando.texto,
        corrigeEntradaId: comando.corrigeEntradaId,
        operacionId: comando.operacionId,
      });
    } catch (err) {
      if (err instanceof ErrorBitacoraIncidente) throw traducir(err);
      throw err;
    }
  }
}
