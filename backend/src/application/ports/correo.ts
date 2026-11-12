export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};
export interface ICorreo {
  enviar(input: SendMailInput): Promise<'enviado' | 'registrado'>;
  getModoTransporte(): 'brevo-api' | 'smtp' | 'dev-log';
}
