/** Comprobación mínima de propiedad, separada de las lecturas y escrituras del plan. */
export interface IPropiedadExpedicion {
  /** true solo si la expedición existe y pertenece al senderista. */
  esPropietario(senderistaId: string, expedicionId: string): Promise<boolean>;
}
