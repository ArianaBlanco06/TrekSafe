import type { ResultadoEnvioTransporte } from '../entities/OutboxNotificacion.js';

export type DatosEnvioCorreo = {
  destinatario: string;
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml?: string;
};

/**
 * Contrato común para los mecanismos de envío de correo (Brevo API, SMTP, DevLog)
 * siguiendo el patrón Adapter.
 */
export interface ITransporteCorreo {
  obtenerModo(): 'brevo-api' | 'smtp' | 'dev-log';
  enviar(datos: DatosEnvioCorreo): Promise<ResultadoEnvioTransporte>;
}
