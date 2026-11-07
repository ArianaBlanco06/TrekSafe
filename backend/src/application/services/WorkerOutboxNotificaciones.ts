import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { ITransporteCorreo } from '../../domain/services/ITransporteCorreo.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { RelojSistema } from '../../domain/services/IReloj.js';
import type { MensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';

export interface PoliticaEsperaReintento {
  calcularEsperaMs(intento: number): number;
}

/**
 * Espera exponencial:
 * Intento 1: 1 minuto (60_000 ms)
 * Intento 2: 5 minutos (300_000 ms)
 * Intento 3: 15 minutos (900_000 ms)
 */
export class PoliticaEsperaExponencial implements PoliticaEsperaReintento {
  calcularEsperaMs(intento: number): number {
    if (intento <= 1) return 60 * 1000;
    if (intento === 2) return 5 * 60 * 1000;
    return 15 * 60 * 1000;
  }
}

export class WorkerOutboxNotificaciones {
  private readonly duracionLeaseMs: number;
  private readonly politicaEspera: PoliticaEsperaReintento;
  private readonly reloj: IReloj;

  constructor(
    private readonly repositorio: IRepositorioOutbox,
    private readonly transporte: ITransporteCorreo,
    opciones?: {
      duracionLeaseMs?: number;
      politicaEspera?: PoliticaEsperaReintento;
      reloj?: IReloj;
    },
  ) {
    this.duracionLeaseMs = opciones?.duracionLeaseMs ?? 5 * 60 * 1000; // 5 minutos por defecto
    this.politicaEspera = opciones?.politicaEspera ?? new PoliticaEsperaExponencial();
    this.reloj = opciones?.reloj ?? new RelojSistema();
  }

  /**
   * Ejecuta un ciclo de procesamiento de avisos pendientes en el outbox.
   * Adquiere un lease distribuido en base de datos para prevenir colisiones entre múltiples instancias.
   */
  async procesarLote(workerId: string, limite = 10): Promise<{
    procesados: number;
    exitosos: number;
    reintentados: number;
    fallidos: number;
    inciertos: number;
  }> {
    const ahora = this.reloj.ahora();
    const pendientes = await this.repositorio.obtenerParaProcesar(ahora, limite);

    let procesados = 0;
    let exitosos = 0;
    let reintentados = 0;
    let fallidos = 0;
    let inciertos = 0;

    for (const mensaje of pendientes) {
      // 1. Intentar adquirir lease
      const leaseObtenido = await this.repositorio.adquirirLease(
        mensaje.id,
        workerId,
        this.duracionLeaseMs,
        ahora,
      );

      if (!leaseObtenido) {
        // Otro worker ya adquirió el registro
        continue;
      }

      procesados++;
      const resultado = await this.procesarMensaje(mensaje);

      if (resultado === 'enviado') exitosos++;
      else if (resultado === 'reintentado') reintentados++;
      else if (resultado === 'fallido') fallidos++;
      else if (resultado === 'incierto') inciertos++;
    }

    return { procesados, exitosos, reintentados, fallidos, inciertos };
  }

  private async procesarMensaje(
    mensaje: MensajeOutbox,
  ): Promise<'enviado' | 'reintentado' | 'fallido' | 'incierto'> {
    const intentoActual = mensaje.intentos + 1;
    const ahora = this.reloj.ahora();

    try {
      const resultadoTransporte = await this.transporte.enviar({
        destinatario: mensaje.destinatario,
        asunto: mensaje.asunto,
        cuerpoTexto: mensaje.cuerpo,
        cuerpoHtml: mensaje.cuerpoHtml,
      });

      if (resultadoTransporte.estado === 'enviado') {
        await this.repositorio.marcarEnviado(mensaje.id, resultadoTransporte.modo, ahora);
        return 'enviado';
      }

      if (resultadoTransporte.estado === 'incierto') {
        // HU-45: "Timeout ambiguo queda incierto. Inciertos requieren revisión y no cuentan como entregados"
        await this.repositorio.marcarIncierto(
          mensaje.id,
          intentoActual,
          resultadoTransporte.error || 'Respuesta ambigua o timeout no confirmado',
        );
        return 'incierto';
      }

      // Si es fallido confirmado:
      if (intentoActual >= mensaje.maxIntentos) {
        // Agotó los intentos (máximo 3)
        await this.repositorio.marcarFallido(
          mensaje.id,
          intentoActual,
          resultadoTransporte.error || 'Agotó el número máximo de reintentos',
        );
        return 'fallido';
      }

      // Programar siguiente reintento con espera creciente
      const esperaMs = this.politicaEspera.calcularEsperaMs(intentoActual);
      const proximoIntento = new Date(ahora.getTime() + esperaMs);
      await this.repositorio.marcarReintento(
        mensaje.id,
        proximoIntento,
        intentoActual,
        resultadoTransporte.error || 'Error temporal de envío',
      );
      return 'reintentado';
    } catch (err: any) {
      // Excepción no capturada en transporte -> Tratar como incierto para análisis seguro
      await this.repositorio.marcarIncierto(
        mensaje.id,
        intentoActual,
        `Excepción no controlada: ${err?.message || String(err)}`,
      );
      return 'incierto';
    }
  }
}
