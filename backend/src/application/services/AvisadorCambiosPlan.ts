import { GeneradorAvisosEvento } from './servicioBandejaAvisos.js';

export type EventoPlanPendiente = {
  id: string;
  expedicionId: string;
  senderistaId: string;
  tipo: 'EDITADA' | 'CANCELADA' | 'RETORNO_AMPLIADO';
  motivo?: string | null;
  cambios?: Record<string, any>;
};

export interface IRepositorioEventosAvisos {
  buscarIdEventoPorOperacion(operacionId: string, expedicionId: string): Promise<string | null>;
  buscarEventosPendientes(senderistaId?: string): Promise<EventoPlanPendiente[]>;
}

/**
 * HU-37: después de editar, cancelar o ampliar un plan, deja el aviso en la bandeja.
 * Busca el evento que la RPC guardó en eventos_plan con la misma operacionId.
 * Un fallo aquí no deshace ni rompe la operación del senderista.
 * Incluye reconsumo durable idempotente de eventos pendientes.
 */
export class AvisadorCambiosPlan {
  constructor(
    private readonly repo: IRepositorioEventosAvisos,
    private readonly generador: GeneradorAvisosEvento,
  ) {}

  async avisarEdicion(usuarioId: string, expedicionId: string, operacionId?: string): Promise<void> {
    await this.avisar(expedicionId, operacionId, (eventoId) =>
      this.generador.generarDesdeEdicion(usuarioId, expedicionId, 'Se actualizaron los datos de tu plan.', eventoId),
    );
  }

  async avisarCancelacion(usuarioId: string, expedicionId: string, operacionId: string, motivo: string | null): Promise<void> {
    await this.avisar(expedicionId, operacionId, (eventoId) =>
      this.generador.generarDesdeCancelacion(usuarioId, expedicionId, motivo ?? 'sin motivo', eventoId),
    );
  }

  async avisarAmpliacion(usuarioId: string, expedicionId: string, operacionId: string, nuevaHora: string): Promise<void> {
    await this.avisar(expedicionId, operacionId, (eventoId) =>
      this.generador.generarDesdeAmpliacion(usuarioId, expedicionId, nuevaHora, eventoId),
    );
  }

  private async avisar(
    expedicionId: string,
    operacionId: string | undefined,
    crear: (eventoId: string) => Promise<unknown>,
  ): Promise<void> {
    if (!operacionId) return;
    try {
      const eventoId = await this.repo.buscarIdEventoPorOperacion(operacionId, expedicionId);
      if (!eventoId) return; // Sin cambios reales: la RPC no guardó evento.
      await crear(eventoId);
    } catch (err) {
      console.error('[HU-37] No se pudo crear el aviso del cambio del plan', err);
    }
  }

  /**
   * Reconstruye de forma durable e idempotente avisos in-app para eventos_plan
   * que no tienen aún aviso registrado (por fallos transitorios tras la RPC).
   */
  async reconstruirEventosPendientes(senderistaId?: string): Promise<number> {
    try {
      const pendientes = await this.repo.buscarEventosPendientes(senderistaId);
      let creados = 0;

      for (const ev of pendientes) {
        try {
          if (ev.tipo === 'EDITADA') {
            await this.generador.generarDesdeEdicion(
              ev.senderistaId,
              ev.expedicionId,
              'Se actualizaron los datos de tu plan.',
              ev.id,
            );
            creados++;
          } else if (ev.tipo === 'CANCELADA') {
            await this.generador.generarDesdeCancelacion(
              ev.senderistaId,
              ev.expedicionId,
              ev.motivo ?? 'sin motivo',
              ev.id,
            );
            creados++;
          } else if (ev.tipo === 'RETORNO_AMPLIADO') {
            const nuevaHora =
              ev.cambios?.horaRetornoEstimada?.despues ??
              'nueva hora límite';
            await this.generador.generarDesdeAmpliacion(
              ev.senderistaId,
              ev.expedicionId,
              nuevaHora,
              ev.id,
            );
            creados++;
          }
        } catch (innerErr) {
          console.error(`[HU-37] Error al reconsumir evento ${ev.id}`, innerErr);
        }
      }

      return creados;
    } catch (err) {
      console.error('[HU-37] No se pudieron reconstruir los eventos pendientes', err);
      return 0;
    }
  }
}
