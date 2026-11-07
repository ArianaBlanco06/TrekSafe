import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import { RepositorioOutboxSupabase } from '../../infrastructure/repositories/RepositorioOutboxSupabase.js';
import { RepositorioRescate } from '../../infrastructure/repositories/RepositorioRescate.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export type ItemDespachoIncidenteDTO = {
  id: string;
  destinatario: string;
  asunto: string;
  tipoEvento: string;
  estado: 'pendiente' | 'enviado' | 'fallido' | 'incierto';
  intentos: number;
  maxIntentos: number;
  modoEnvio: string | null;
  ultimoError: string | null;
  proximoIntentoEn: string;
  enviadoEn: string | null;
  creadoEn: string;
  permiteReintentoManual: boolean;
};

export type ResumenEntregaIncidenteDTO = {
  expedicionId: string;
  totalDespachos: number;
  enviados: number;
  fallidos: number;
  inciertos: number;
  pendientes: number;
  despachos: ItemDespachoIncidenteDTO[];
};

export type ResultadoReintentoManualDTO = {
  id: string;
  estadoAnterior: string;
  nuevoEstado: string;
  mensaje: string;
};

/**
 * Patrón Facade:
 * Proporciona una interfaz unificada y simplificada para la consola de incidentes de rescate,
 * reuniendo las operaciones de:
 * 1. Verificación de autorización de rescatista/responsable.
 * 2. Consulta y consolidación de despachos de notificaciones del incidente.
 * 3. Ejecución de reintentos manuales idempotentes únicamente para estados fallidos definitivos.
 */
export class FachadaEntregaAvisosIncidente {
  private readonly clavesIdempotenciaProcesadas = new Set<string>();

  constructor(
    private readonly repoOutbox: IRepositorioOutbox = new RepositorioOutboxSupabase(),
    private readonly repoRescate: RepositorioRescate = new RepositorioRescate(),
  ) {}

  /**
   * Consulta el estado de todos los despachos de avisos asociados a un incidente.
   * Valida que el actor tenga rol de rescatista.
   */
  async consultarDespachosIncidente(
    rescatistaId: string,
    expedicionId: string,
  ): Promise<ResumenEntregaIncidenteDTO> {
    await this.repoRescate.verificarEsRescatista(rescatistaId);

    const mensajes = await this.repoOutbox.listarPorExpedicion(expedicionId);

    let enviados = 0;
    let fallidos = 0;
    let inciertos = 0;
    let pendientes = 0;

    const despachos: ItemDespachoIncidenteDTO[] = mensajes.map((m) => {
      if (m.estado === 'enviado') enviados++;
      else if (m.estado === 'fallido') fallidos++;
      else if (m.estado === 'incierto') inciertos++;
      else if (m.estado === 'pendiente') pendientes++;

      return {
        id: m.id,
        destinatario: m.destinatario,
        asunto: m.asunto,
        tipoEvento: m.tipoEvento,
        estado: m.estado,
        intentos: m.intentos,
        maxIntentos: m.maxIntentos,
        modoEnvio: m.modoEnvio ?? null,
        ultimoError: m.ultimoError ?? null,
        proximoIntentoEn: m.proximoIntentoEn.toISOString(),
        enviadoEn: m.enviadoEn ? m.enviadoEn.toISOString() : null,
        creadoEn: m.creadoEn.toISOString(),
        // Solo los fallidos definitivos permiten reintento manual
        // Los enviados nunca se repiten. Los inciertos requieren revisión.
        permiteReintentoManual: m.estado === 'fallido',
      };
    });

    return {
      expedicionId,
      totalDespachos: mensajes.length,
      enviados,
      fallidos,
      inciertos,
      pendientes,
      despachos,
    };
  }

  /**
   * Reintenta manualmente el envío de un aviso que falló definitivamente.
   * Reglas de negocio del DoD:
   * - Solo para fallidos definitivos (m.estado === 'fallido').
   * - Los enviados NO se repiten bajo ninguna circunstancia.
   * - Los inciertos requieren revisión y no cuentan como entregados (no se auto-reintentan como simple fallo).
   * - Idempotencia para evitar múltiples reencolamientos simultáneos con la misma clave.
   */
  async reintentarDespachoManual(
    rescatistaId: string,
    expedicionId: string,
    mensajeOutboxId: string,
    claveIdempotencia?: string,
  ): Promise<ResultadoReintentoManualDTO> {
    await this.repoRescate.verificarEsRescatista(rescatistaId);

    if (claveIdempotencia) {
      if (this.clavesIdempotenciaProcesadas.has(claveIdempotencia)) {
        return {
          id: mensajeOutboxId,
          estadoAnterior: 'fallido',
          nuevoEstado: 'pendiente',
          mensaje: 'Reintento manual ya recibido previamente (idempotente).',
        };
      }
      this.clavesIdempotenciaProcesadas.add(claveIdempotencia);
    }

    const mensaje = await this.repoOutbox.buscarPorId(mensajeOutboxId);
    if (!mensaje) {
      throw new ErrorAplicacion(404, 'Despacho de notificación no encontrado');
    }

    // Comprobar pertenencia a la expedición
    if (mensaje.metadata?.expedicionId && mensaje.metadata.expedicionId !== expedicionId) {
      throw new ErrorAplicacion(403, 'El aviso no pertenece al incidente indicado');
    }

    // Regla: Los enviados no se repiten
    if (mensaje.estado === 'enviado') {
      throw new ErrorAplicacion(
        400,
        'El aviso ya fue entregado exitosamente y no puede volver a enviarse para evitar duplicados.',
        'AVISO_YA_ENVIADO',
      );
    }

    // Regla: Los inciertos requieren revisión técnica previa
    if (mensaje.estado === 'incierto') {
      throw new ErrorAplicacion(
        400,
        'El aviso se encuentra en estado incierto debido a una respuesta ambigua o timeout. Requiere revisión previa antes de un reintento.',
        'ESTADO_INCIERTO_REQUIERE_REVISION',
      );
    }

    if (mensaje.estado === 'pendiente') {
      return {
        id: mensaje.id,
        estadoAnterior: 'pendiente',
        nuevoEstado: 'pendiente',
        mensaje: 'El aviso ya se encuentra en cola pendiente para su procesamiento.',
      };
    }

    // Reencolar aviso fallido para procesamiento inmediato por el worker
    await this.repoOutbox.reencolarParaReintentoManual(mensaje.id);

    return {
      id: mensaje.id,
      estadoAnterior: 'fallido',
      nuevoEstado: 'pendiente',
      mensaje: 'Aviso reencolado con éxito para procesamiento inmediato.',
    };
  }
}
