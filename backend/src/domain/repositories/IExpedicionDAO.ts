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

/** Datos que la persistencia necesita para cancelar un plan (HU-27). */
export type SolicitudCancelacionPlan = {
  expedicionId: string;
  senderistaId: string;
  operacionId: string;
  motivo: string | null;
};

export type ResultadoCancelacionPlan = {
  id: string;
  version: number;
  estado: 'cancelada';
};

/** Datos que la persistencia necesita para ampliar el retorno (HU-35). */
export type SolicitudAmpliacionRetorno = {
  expedicionId: string;
  senderistaId: string;
  versionEsperada: number;
  operacionId: string;
  minutos: number;
  motivo: string;
};

export type ResultadoAmpliacionRetorno = {
  id: string;
  version: number;
  horaRetornoEstimada: string;
  fechaLimite: string;
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

  /**
   * Cancela el plan y registra su evento de forma atómica e idempotente.
   * La misma operación devuelve su resultado registrado; un plan ya cancelado
   * devuelve su estado actual sin escribir ni registrar otro evento.
   * @throws ErrorCancelacionPlan si alguna regla de negocio la rechaza.
   */
  cancelarPlan(solicitud: SolicitudCancelacionPlan): Promise<ResultadoCancelacionPlan>;

  /** Cantidad de eventos `RETORNO_AMPLIADO` registrados para la expedición. */
  contarAmpliaciones(expedicionId: string): Promise<number>;

  /**
   * Amplía `hora_retorno_estimada` y registra el evento `RETORNO_AMPLIADO` de forma
   * atómica, con compare-and-swap sobre estado y versión. Comprueba el límite con el
   * reloj de la base. La misma operación devuelve su resultado registrado.
   * @throws ErrorAmpliacionRetorno si alguna regla de negocio la rechaza.
   */
  ampliarRetorno(solicitud: SolicitudAmpliacionRetorno): Promise<ResultadoAmpliacionRetorno>;
}
