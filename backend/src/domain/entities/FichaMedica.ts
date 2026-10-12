export type FichaMedica = {
  id: string;
  senderistaId: string;
  tipoSangre: string;
  condicionesEncriptadas: string;
  consentimientoFirmado: boolean;
  creadoEn?: string;
  actualizadoEn?: string;
};
