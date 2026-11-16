import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ITransporteCorreo, DatosEnvioCorreo } from '../../../domain/services/ITransporteCorreo.js';
import type { ResultadoEnvioTransporte } from '../../../domain/entities/OutboxNotificacion.js';
import { loadEnv } from '../../config/env.js';
import { parseSenderAddress } from '../mailUtils.js';

export class SmtpTransporteAdapter implements ITransporteCorreo {
  private transporter: Transporter | null = null;

  obtenerModo(): 'smtp' {
    return 'smtp';
  }

  private obtenerTransporter(): Transporter {
    if (!this.transporter) {
      const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = loadEnv();
      const tlsServername =
        smtpHost === 'smtp-relay.brevo.com' ? 'smtp-relay.sendinblue.com' : undefined;

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
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

  async enviar(datos: DatosEnvioCorreo): Promise<ResultadoEnvioTransporte> {
    const { smtpFrom } = loadEnv();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remitente = parseSenderAddress(smtpFrom);
      const transportador = this.obtenerTransporter();
      const envio = transportador.sendMail({
        from: { name: remitente.name, address: remitente.email },
        to: datos.destinatario,
        subject: datos.asunto,
        html: datos.cuerpoHtml,
        text: datos.cuerpoTexto,
      });
      const res = await Promise.race([
        envio,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            // Un plazo absoluto cierra el socket incluso si el servidor sigue enviando bytes.
            transportador.close();
            this.transporter = null;
            reject(new Error('SMTP_TIMEOUT_INCIERTO'));
          }, 30000);
        }),
      ]);

      return {
        estado: 'enviado',
        modo: 'smtp',
        detalles: { messageId: res.messageId },
      };
    } catch (err: unknown) {
      const codigo=typeof err==='object'&&err!==null&&'responseCode' in err?Number(err.responseCode):0;
      const rechazo=codigo>=400&&codigo<600;
      return {estado:rechazo?'fallido':'incierto',modo:'smtp',error:rechazo?'RECHAZO_CONFIRMADO':'RESULTADO_INCIERTO'};
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
