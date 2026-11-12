/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
export type TipoDespachoCorreo = 'alerta_contacto' | 'alerta_rescate';
export interface IRepositorioDespachoCorreo {
  yaFueEnviado(
    expedicionId: string,
    tipoDespacho: TipoDespachoCorreo,
    claveDestinatario: string,
  ): Promise<boolean>;
  registrarEnvio(
    expedicionId: string,
    tipoDespacho: TipoDespachoCorreo,
    claveDestinatario: string,
  ): Promise<void>;
}
