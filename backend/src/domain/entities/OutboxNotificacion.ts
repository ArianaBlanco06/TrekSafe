export type EstadoOutbox = 'pendiente' | 'enviado' | 'fallido' | 'incierto';

export type ResultadoEnvioTransporte = {
  estado: 'enviado' | 'fallido' | 'incierto';
  modo: 'brevo-api' | 'smtp' | 'dev-log';
  error?: string;
  detalles?: Record<string, unknown>;
};

export type MensajeOutbox = {
  id: string;
  claveEvento: string;
  canal: string;
  tipoEvento: string;
  destinatario: string;
  destinatarioNormalizado?: string;
  asunto: string;
  cuerpo: string;
  cuerpoHtml?: string;
  metadata?: Record<string, unknown>;
  estado: EstadoOutbox;
  intentos: number;
  maxIntentos: number;
  proximoIntentoEn: Date;
  bloqueadoHasta?: Date | null;
  bloqueadoPor?: string | null;
  ultimoError?: string | null;
  modoEnvio?: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
  enviadoEn?: Date | null;
};

export type NuevoMensajeOutbox = {
  claveEvento: string;
  canal?: string;
  tipoEvento: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  cuerpoHtml?: string;
  metadata?: Record<string, unknown>;
  maxIntentos?: number;
};
