import type { Request, Response } from 'express';
import type { FachadaFichaMedicaIncidente } from '../../../application/services/FachadaFichaMedicaIncidente.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

/**
 * Ficha médica de un incidente (HU-50).
 *
 * GET /api/rescate/incidentes/:incidenteId/ficha-medica
 *   200 { fichaMedica: { tipoSangre, alergias, condiciones, medicamentos }, acceso: { incidenteId, auditoriaId, registradoEn } }
 *   400 UUID inválido (sin auditoría)
 *   401 sin token (middleware) · 403 el actor no es un rescatista validado (middleware)
 *   403 ACCESO_FICHA_DENEGADO { motivo }: no es el responsable vigente, incidente cerrado,
 *       sin consentimiento o perfil no validado
 *   404 INCIDENTE_NO_ENCONTRADO
 *   409 ACCESO_FICHA_CONTEXTO_CAMBIADO: relevo o cierre durante la consulta
 *   500 FICHA_ILEGIBLE · 503 AUDITORIA_NO_DISPONIBLE (la ficha no se muestra)
 *
 * El actor sale siempre del JWT. Cada consulta, permitida o denegada, queda auditada. Ningún
 * rechazo trae datos de salud.
 */
export function crearControladorFichaMedicaIncidente(fachada: FachadaFichaMedicaIncidente) {
  return {
    async consultar(req: Request, res: Response): Promise<void> {
      const actorId = (req as SolicitudAutenticada).user.id;
      const resultado = await fachada.consultar(actorId, String(req.params.incidenteId));
      res.status(200).json(resultado);
    },
  };
}
