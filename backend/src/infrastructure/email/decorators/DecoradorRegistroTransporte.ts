import type { ITransporteCorreo, DatosEnvioCorreo } from '../../../domain/services/ITransporteCorreo.js';
import type { ResultadoEnvioTransporte } from '../../../domain/entities/OutboxNotificacion.js';

export class DecoradorRegistroTransporte implements ITransporteCorreo {
  constructor(private readonly decorado: ITransporteCorreo) {}

  obtenerModo(): 'brevo-api' | 'smtp' | 'dev-log' {
    return this.decorado.obtenerModo();
  }

  async enviar(datos: DatosEnvioCorreo): Promise<ResultadoEnvioTransporte> {
    const inicio = Date.now();
    const modo = this.obtenerModo();

    console.log(
      `[Outbox:Transporte] [${modo}] Intentando enviar correo a: ${datos.destinatario} | Asunto: "${datos.asunto}"`,
    );

    try {
      const resultado = await this.decorado.enviar(datos);
      const duracionMs = Date.now() - inicio;

      console.log(
        `[Outbox:Transporte] [${modo}] Resultado: ${resultado.estado} en ${duracionMs}ms` +
          (resultado.error ? ` | Error: ${resultado.error}` : ''),
      );

      return {
        ...resultado,
        detalles: {
          ...resultado.detalles,
          duracionMs,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      const duracionMs = Date.now() - inicio;
      console.error(
        `[Outbox:Transporte] [${modo}] Excepción no controlada tras ${duracionMs}ms:`,
        err,
      );

      return {
        estado: 'incierto',
        modo,
        error: `Excepción inesperada en transporte: ${err?.message || String(err)}`,
        detalles: { duracionMs, timestamp: new Date().toISOString() },
      };
    }
  }
}
