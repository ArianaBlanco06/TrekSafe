import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { loadEnv } from '../config/env.js';
import { sendViaBrevoApi } from './BrevoApiMailer.js';
import {
  brevoIpAuthHint,
  fetchOutboundIp,
  ErrorEnvioCorreo,
  parseSenderAddress,
  type SendMailInput,
} from './mailUtils.js';

export type ModoTransporteCorreo = 'brevo-api' | 'smtp' | 'dev-log';

export class ServicioCorreo {
  private transporter: Transporter | null = null;

  estaConfigurado(): boolean {
    const { brevoApiKey, smtpHost, smtpUser, smtpPass } = loadEnv();
    return Boolean(brevoApiKey || (smtpHost && smtpUser && smtpPass));
  }

  getModoTransporte(): ModoTransporteCorreo {
    const { brevoApiKey, smtpHost, smtpUser, smtpPass } = loadEnv();
    if (brevoApiKey) return 'brevo-api';
    if (smtpHost && smtpUser && smtpPass) return 'smtp';
    return 'dev-log';
  }

  private debeUsarFallbackDev(): boolean {
    const { nodeEnv, mailDevFallback } = loadEnv();
    return mailDevFallback || nodeEnv === 'development';
  }

  private obtenerTransportadorSmtp(): Transporter {
    if (!this.transporter) {
      const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = loadEnv();
      // Brevo regional relays present certs for *.sendinblue.com, not smtp-relay.brevo.com
      const tlsServername =
        smtpHost === 'smtp-relay.brevo.com' ? 'smtp-relay.sendinblue.com' : undefined;
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        requireTLS: !smtpSecure && smtpPort === 587,
        auth: { user: smtpUser, pass: smtpPass },
        tls: {
          minVersion: 'TLSv1.2',
          ...(tlsServername ? { servername: tlsServername } : {}),
        },
      });
    }
    return this.transporter;
  }

  private logDev(input: SendMailInput): void {
    console.log(
      `[Correo:dev] Para: ${input.to} | Asunto: ${input.subject}\n${input.text ?? '(cuerpo HTML)'}`,
    );
  }

  private async enviarSmtp(input: SendMailInput): Promise<void> {
    const { smtpFrom } = loadEnv();
    const remitente = parseSenderAddress(smtpFrom);

    await this.obtenerTransportadorSmtp().sendMail({
      from: { name: remitente.name, address: remitente.email },
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }

  async verificarConexion(): Promise<void> {
    const modo = this.getModoTransporte();
    if (modo === 'dev-log') {
      console.log('[Correo] modo dev-log (sin credenciales SMTP/API)');
      return;
    }

    if (modo === 'brevo-api') {
      console.log('[Correo] transporte Brevo API configurado');
      return;
    }

    try {
      await this.obtenerTransportadorSmtp().verify();
      console.log('[Correo] conexión SMTP verificada');
    } catch (err) {
      const ipSaliente = await fetchOutboundIp();
      const pista = brevoIpAuthHint(ipSaliente, err);
      console.warn(`[Correo] verificación SMTP falló: ${formatearErrorCorreo(err)}`);
      console.warn(`[Correo] ${pista}`);
      if (this.debeUsarFallbackDev()) {
        console.warn('[Correo] desarrollo: se usará dev-log si el envío SMTP falla');
        return;
      }
      throw new ErrorEnvioCorreo(formatearErrorCorreo(err), 'SMTP_VERIFICACION_FALLIDA', pista);
    }
  }

  async enviar(input: SendMailInput): Promise<'enviado' | 'registrado'> {
    const modo = this.getModoTransporte();

    if (modo === 'dev-log') {
      this.logDev(input);
      return 'registrado';
    }

    try {
      if (modo === 'brevo-api') {
        await sendViaBrevoApi(input);
      } else {
        await this.enviarSmtp(input);
      }
      return 'enviado';
    } catch (err) {
      if (!this.debeUsarFallbackDev()) {
        throw err;
      }

      const ipSaliente = await fetchOutboundIp();
      console.warn(`[Correo] envío falló (${formatearErrorCorreo(err)}). Fallback dev-log.`);
      console.warn(`[Correo] ${brevoIpAuthHint(ipSaliente, err)}`);
      this.logDev(input);
      return 'registrado';
    }
  }
}

function formatearErrorCorreo(err: unknown): string {
  if (err instanceof ErrorEnvioCorreo) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: string; response?: string; code?: string };
    return [e.message, e.response, e.code].filter(Boolean).join(' — ');
  }
  return String(err);
}
