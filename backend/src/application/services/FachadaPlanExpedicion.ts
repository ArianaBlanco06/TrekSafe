import type { ILectorPlan, ILectorPuntos, ILectorPreparacion } from '../ports/planExpedicion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

/** Reúne el recorrido y su preparación sin exponer escrituras ni contactos. */
export class FachadaPlanExpedicion {
  constructor(
    private readonly planes: ILectorPlan,
    private readonly puntos: ILectorPuntos,
    private readonly preparaciones: ILectorPreparacion,
  ) {}

  async obtener(senderistaId: string, expedicionId: string) {
    const plan = await this.planes.obtenerPlan(expedicionId, senderistaId);
    if (!plan || plan.senderistaId !== senderistaId || plan.id !== expedicionId) {
      throw new ErrorAplicacion(404, 'Expedición no encontrada.', 'EXPEDICION_NO_ENCONTRADA');
    }
    const [ruta, preparacion] = await Promise.all([
      this.puntos.consultarPropia(senderistaId, expedicionId),
      this.preparaciones.obtenerPreparacion(senderistaId, expedicionId),
    ]);
    if (!ruta || ruta.expedicion.id !== expedicionId || (preparacion && (
      preparacion.senderistaId !== senderistaId || preparacion.expedicionId !== expedicionId
    ))) {
      throw new ErrorAplicacion(404, 'Expedición no encontrada.', 'EXPEDICION_NO_ENCONTRADA');
    }
    if (plan.version !== ruta.expedicion.version) {
      throw new ErrorAplicacion(409, 'El plan cambió durante la consulta. Actualiza el recorrido.', 'RECORRIDO_ACTUALIZADO');
    }
    return {
      plan: {
        id: plan.id, estado: plan.estado, version: plan.version,
        lugarInicio: plan.lugarInicio, lugarFin: plan.lugarFin,
        coordenadasInicio: plan.coordenadasInicio, coordenadasFin: plan.coordenadasFin,
        horaInicio: plan.horaInicio, horaRetornoEstimada: plan.horaRetornoEstimada,
        minutosTolerancia: plan.minutosTolerancia,
      },
      puntos: [...ruta.puntos].sort((a, b) => a.orden - b.orden),
      preparacion,
    };
  }
}
