import { z } from 'zod';
import type { MotivoDenegacionFicha } from '../../domain/value-objects/accesoFichaMedica.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export const consultaFichaSchema = z.object({
  actorId: z.string().uuid('Identificador de rescatista inválido'),
  incidenteId: z.string().uuid('Identificador de incidente inválido'),
});

export type FichaMedicaAutorizada = {
  tipoSangre: string;
  alergias: string;
  condiciones: string;
  medicamentos: string;
};

export type ResultadoConsultaFicha = {
  fichaMedica: FichaMedicaAutorizada;
  acceso: { incidenteId: string; auditoriaId: string; registradoEn: string };
};

const MENSAJE_DENEGADO =
  'Solo el responsable vigente de un incidente abierto puede consultar la ficha médica autorizada';

/**
 * Traduce un motivo de denegación al error HTTP. El cuerpo lleva `codigo` y `motivo`, y
 * nunca datos de salud. Nunca es 401: el rechazo de negocio no es una sesión inválida.
 */
export function errorDenegacionFicha(motivo: MotivoDenegacionFicha): ErrorAplicacion {
  switch (motivo) {
    case 'INCIDENTE_NO_ENCONTRADO':
      return new ErrorAplicacion(404, 'Incidente no encontrado', 'INCIDENTE_NO_ENCONTRADO', { motivo });
    case 'CONTEXTO_CAMBIADO':
      return new ErrorAplicacion(
        409,
        'La coordinación del incidente cambió durante la consulta; vuelve a intentarlo',
        'ACCESO_FICHA_CONTEXTO_CAMBIADO',
        { motivo },
      );
    default:
      return new ErrorAplicacion(403, MENSAJE_DENEGADO, 'ACCESO_FICHA_DENEGADO', { motivo });
  }
}
