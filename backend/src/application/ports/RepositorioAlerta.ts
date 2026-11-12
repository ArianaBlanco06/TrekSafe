/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
export type ContextoAlertaExpedicion = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  contactos: {
    nombreCompleto: string;
    correoElectronico: string;
    parentesco: string;
  }[];
};
export type ContextoAlertaRescate = ContextoAlertaExpedicion & {
  senderistaId: string;
  telefonoSenderista: string;
  horaInicio: string;
  acompanantes: string[];
  contactosEmergencia: {
    nombreCompleto: string;
    telefono: string;
    parentesco: string;
  }[];
};
export interface IRepositorioAlerta {
  buscarContextoAlerta(
    expedicionId: string,
    permitirCualquierEstado?: boolean,
  ): Promise<ContextoAlertaExpedicion | null>;
  buscarContextoAlertaRescate(
    expedicionId: string,
    permitirCualquierEstado?: boolean,
  ): Promise<ContextoAlertaRescate | null>;
}
