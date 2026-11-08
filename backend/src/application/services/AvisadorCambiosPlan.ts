import { RepositorioAvisosSupabase } from '../../infrastructure/repositories/RepositorioAvisosSupabase.js';
import { GeneradorAvisosEvento, ServicioBandejaAvisos } from './servicioBandejaAvisos.js';

/**
 * HU-37: después de editar, cancelar o ampliar un plan, deja el aviso en la bandeja.
 * Busca el evento que la RPC guardó en eventos_plan con la misma operacionId.
 * Un fallo aquí no deshace ni rompe la operación del senderista.
 */
export class AvisadorCambiosPlan {
  constructor(
    private readonly repo: RepositorioAvisosSupabase = new RepositorioAvisosSupabase(),
    private readonly generador: GeneradorAvisosEvento = new GeneradorAvisosEvento(
      new ServicioBandejaAvisos(),
    ),
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
}
