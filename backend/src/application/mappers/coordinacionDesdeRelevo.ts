import type { Coordinacion, ResultadoRelevo } from '../../domain/repositories/IIncidenteDAO.js';

/**
 * La coordinación vigente tras proponer o aceptar un relevo, vista por quien actúa (parte
 * del relevo, por eso recibe el motivo). Tiene la misma forma que la `coordinacion` de las
 * lecturas de la consola; `relevoPendiente` solo existe mientras el relevo esté pendiente.
 * Sin datos médicos.
 */
export function coordinacionDesdeRelevo({ incidente, relevo }: ResultadoRelevo, rescatistaId: string): Coordinacion {
  const coordinacion: Coordinacion = {
    incidenteId: incidente.id,
    version: incidente.version,
    responsableId: incidente.responsableId,
    nombreResponsable: incidente.nombreResponsable,
    asumidoEn: incidente.asumidoEn,
    esMia: incidente.responsableId === rescatistaId,
  };
  if (relevo.estado === 'pendiente') {
    coordinacion.relevoPendiente = {
      relevoId: relevo.id,
      destinatarioId: relevo.destinatarioId,
      nombreDestinatario: relevo.nombreDestinatario,
      solicitadoEn: relevo.solicitadoEn,
      esParaMi: relevo.destinatarioId === rescatistaId,
      motivo: relevo.motivo,
    };
  }
  return coordinacion;
}
