import {
  FabricaReglaRecordatorio,
} from '../../domain/strategies/IReglaRecordatorio.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { RelojSistema } from '../../infrastructure/services/RelojSistema.js';
import { RepositorioExpedicion } from '../../infrastructure/repositories/RepositorioExpedicion.js';
import { ServicioBandejaAvisos } from './servicioBandejaAvisos.js';

export type ResultadoProcesamientoRecordatorios = {
  evaluadas: number;
  avisosGenerados: number;
  avisosOmitidosPorDuplicidad: number;
};

/**
 * Servicio de Aplicación para HU-38: Configurar la anticipación del recordatorio.
 * Coordina la evaluación de umbrales (15, 30, 60 min) usando el patrón Strategy
 * y emite el aviso correspondiente a la bandeja in-app (HU-37).
 */
export class ServicioRecordatorioExpedicion {
  constructor(
    private readonly repoExpedicion: RepositorioExpedicion = new RepositorioExpedicion(),
    private readonly servicioBandeja: ServicioBandejaAvisos = new ServicioBandejaAvisos(),
  ) {}

  /**
   * CA-02: Genera un aviso por expedición y umbral elegido mientras la expedición esté en progreso.
   * Utiliza reloj inyectado para pruebas deterministas sin depender del tiempo real del sistema.
   *
   * @param reloj Reloj inyectado opcional (por defecto reloj real del sistema)
   */
  async procesarRecordatorios(
    reloj: IReloj = new RelojSistema(),
  ): Promise<ResultadoProcesamientoRecordatorios> {
    const expedicionesEnProgreso =
      await this.repoExpedicion.buscarEnProgresoParaRecordatorio();

    let avisosGenerados = 0;
    let avisosOmitidosPorDuplicidad = 0;

    for (const exp of expedicionesEnProgreso) {
      // 1. Obtener la estrategia correspondiente según el umbral configurado (15, 30 o 60 min)
      const regla = FabricaReglaRecordatorio.obtener(exp.minutosRecordatorio);

      // 2. Evaluar si corresponde avisar según el reloj inyectado
      if (regla.correspondeAvisar(exp.horaRetornoEstimada, reloj)) {
        // Clave única del evento para asegurar EXACTAMENTE UN AVISO por expedición y umbral (CA-02)
        const eventoId = `RECORDATORIO:${exp.id}:${regla.minutosAnticipacion}`;

        // Verificar si ya fue emitido previamente
        const yaExiste = await this.servicioBandeja.buscarPorEvento(exp.senderistaId, eventoId);
        if (yaExiste) {
          avisosOmitidosPorDuplicidad++;
          continue;
        }

        const horaFormateada = new Date(exp.horaRetornoEstimada).toLocaleTimeString('es-PE', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Registrar en la bandeja de HU-37 (idempotente por eventoId)
        await this.servicioBandeja.crearAviso({
          usuarioId: exp.senderistaId,
          expedicionId: exp.id,
          eventoId,
          tipo: 'recordatorio',
          titulo: 'Recordatorio de retorno próximo',
          mensaje: `Faltan aproximadamente ${regla.minutosAnticipacion} minutos para la hora estimada de retorno (${horaFormateada}). Recuerda confirmar tu retorno al finalizar.`,
        });

        avisosGenerados++;
      }
    }

    return {
      evaluadas: expedicionesEnProgreso.length,
      avisosGenerados,
      avisosOmitidosPorDuplicidad,
    };
  }
}
