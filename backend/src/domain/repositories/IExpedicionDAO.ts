/** Datos del plan que el senderista puede modificar. */
export type DatosPlan = {
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
};

export type PlanExpedicion = DatosPlan & {
  id: string;
  senderistaId: string;
  estado: string;
  version: number;
  creadoEn?: string;
  actualizadoEn?: string;
};

export type ComandoEditarPlan = {
  expedicionId: string;
  senderistaId: string;
  versionEsperada: number;
  operacionId: string;
  datos: DatosPlan;
};

export type ResultadoEdicionPlan = {
  id: string;
  version: number;
};

export interface IExpedicionDAO {
  /** Devuelve el plan solo si pertenece al senderista; en otro caso, null. */
  obtenerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion | null>;

  /** Resultado ya registrado de esta operación sobre este plan y senderista, si existe. */
  buscarOperacionRegistrada(
    operacionId: string,
    expedicionId: string,
    senderistaId: string,
  ): Promise<ResultadoEdicionPlan | null>;

  /**
   * Aplica la edición y su evento de forma atómica.
   * Si los datos no cambian, no escribe nada y devuelve la versión actual.
   * @throws ErrorEdicionPlan si alguna regla de negocio la rechaza.
   */
  editarPlan(comando: ComandoEditarPlan): Promise<ResultadoEdicionPlan>;
}
