import type { ITransporteCorreo,DatosEnvioCorreo } from '../../../domain/services/ITransporteCorreo.js';
export class DevLogTransporteAdapter implements ITransporteCorreo {
  obtenerModo():'dev-log'{return 'dev-log';}
  async enviar(_datos:DatosEnvioCorreo):Promise<import('../../../domain/entities/OutboxNotificacion.js').ResultadoEnvioTransporte>{
    console.info('[Outbox:dev-log] Simulación sin envío real');
    return {estado:'enviado',modo:'dev-log'};
  }
}
