import type { ITransporteCorreo, DatosEnvioCorreo } from '../../../domain/services/ITransporteCorreo.js';
import type { ResultadoEnvioTransporte } from '../../../domain/entities/OutboxNotificacion.js';
import { sendViaBrevoApi } from '../BrevoApiMailer.js';
import { loadEnv } from '../../config/env.js';

export class BrevoApiTransporteAdapter implements ITransporteCorreo {
  obtenerModo(): 'brevo-api' {
    return 'brevo-api';
  }

  async enviar(datos: DatosEnvioCorreo): Promise<ResultadoEnvioTransporte> {
    const { brevoApiKey } = loadEnv();
    if (!brevoApiKey) {
      return {
        estado: 'fallido',
        modo: 'brevo-api',
        error: 'BREVO_API_KEY no configurada',
      };
    }

    try {
      await sendViaBrevoApi({
        to: datos.destinatario,
        subject: datos.asunto,
        html: datos.cuerpoHtml ?? `<p>${datos.cuerpoTexto}</p>`,
        text: datos.cuerpoTexto,
      });

      return {
        estado: 'enviado',
        modo: 'brevo-api',
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      
      if (
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('etimedout') ||
        errorMsg.toLowerCase().includes('econnreset') ||
        errorMsg.toLowerCase().includes('socket')
      ) {
        return {
          estado: 'incierto',
          modo: 'brevo-api',
          error: `Timeout o respuesta ambigua del proveedor: ${errorMsg}`,
        };
      }

      return {
        estado: 'fallido',
        modo: 'brevo-api',
        error: errorMsg,
      };
    }
  }
}
