import {
  ESTADOS_INCIDENTE_CON_ACCESO_FICHA,
  MOTIVO_PERMITIDO_FICHA,
  type ContextoAccesoFicha,
  type DecisionAccesoFicha,
  type MotivoDenegacionFicha,
} from '../value-objects/accesoFichaMedica.js';

/**
 * Regla única de HU-50: solo el responsable vigente de un incidente no cerrado, con una ficha
 * con consentimiento vigente, puede consultar la ficha médica. Función pura: no lee la base,
 * no audita y no descifra. Los motivos se evalúan en este orden y el primero que falla gana.
 * `CONTEXTO_CAMBIADO` no sale de aquí: solo lo produce la fachada.
 */
export class AutorizadorFichaIncidente {
  decidir(contexto: ContextoAccesoFicha): DecisionAccesoFicha {
    const incidenteId = contexto.incidenteId;
    const denegar = (motivo: MotivoDenegacionFicha): DecisionAccesoFicha => ({
      permitido: false,
      motivo,
      incidenteId,
    });

    if (!contexto.actorEsRescatista) return denegar('NO_ES_RESCATISTA');
    const incidente = contexto.incidente;
    if (incidente === null) return denegar('INCIDENTE_NO_ENCONTRADO');
    if (!ESTADOS_INCIDENTE_CON_ACCESO_FICHA.includes(incidente.estado)) return denegar('INCIDENTE_CERRADO');
    if (incidente.responsableId !== contexto.actorId) return denegar('NO_ES_RESPONSABLE');
    if (!contexto.consentimientoVigente) return denegar('SIN_CONSENTIMIENTO');
    return { permitido: true, motivo: MOTIVO_PERMITIDO_FICHA, incidenteId };
  }
}
