import type { ITransporteCorreo, DatosEnvioCorreo } from '../../../domain/services/ITransporteCorreo.js';
import type { ResultadoEnvioTransporte } from '../../../domain/entities/OutboxNotificacion.js';

export class DevLogTransporteAdapter implements ITransporteCorreo {
  obtenerModo(): 'dev-log' {
    return 'dev-log';
  }

  async enviar(datos: DatosEnvioCorreo): Promise<ResultadoEnvioTransporte> {
    console.log(
      `[Transporte:dev-log] Para: ${datos.destinatario} | Asunto: ${datos.asunto}\n${datos.cuerpoTexto}`,
    );
    return {
      estado: 'enviado',
      modo: 'dev-log',
    };
  }
}
