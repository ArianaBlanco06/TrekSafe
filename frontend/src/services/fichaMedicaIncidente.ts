import { api } from './clienteApi';

/**
 * Ficha médica de un incidente (HU-50). Solo el responsable vigente de un incidente abierto
 * puede consultarla; el servidor audita cada consulta y vuelve a autorizar. Los datos no se
 * guardan en ningún almacenamiento del navegador ni en la caché de la PWA.
 */
export type FichaMedicaAutorizada = {
  tipoSangre: string;
  alergias: string;
  condiciones: string;
  medicamentos: string;
};

export type RespuestaFichaMedica = {
  fichaMedica: FichaMedicaAutorizada;
  acceso: { incidenteId: string; auditoriaId: string; registradoEn: string };
};

export function consultarFichaMedicaIncidente(incidenteId: string) {
  return api.get<RespuestaFichaMedica>(
    `/rescate/incidentes/${encodeURIComponent(incidenteId)}/ficha-medica`,
    true,
  );
}
