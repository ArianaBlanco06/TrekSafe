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
    } catch (err: unknown) {
      const codigo=typeof err==='object'&&err!==null&&'codigo' in err?String(err.codigo):'';
      const rechazo=/^4[0-9]{2}$/.test(codigo)||codigo==='BREVO_IP_BLOQUEADO';
      return {estado:rechazo?'fallido':'incierto',modo:'brevo-api',error:rechazo?'RECHAZO_CONFIRMADO':'RESULTADO_INCIERTO'};
    }
  }
}
