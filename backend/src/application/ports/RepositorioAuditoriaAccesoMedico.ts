/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
export interface IRepositorioAuditoriaAccesoMedico {
  registrarAcceso(input: {
    senderistaId: string;
    expedicionId?: string;
    idAccesor: string;
    rolAccesor: string;
    tipoAcceso: string;
  }): Promise<void>;
}
