import type { Aviso } from '../../domain/entities/Aviso.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';
import type { RespuestaAvisoDTO, RespuestaConteoNoLeidosDTO } from '../dto/aviso.dto.js';

export class ServicioBandejaAvisos {
  constructor(
    private readonly repoAvisos: INotificacionDAO,
  ) {}

  async crearAviso(input: CrearAvisoInput): Promise<Aviso> {
    const existente = await this.repoAvisos.buscarPorEvento(input.usuarioId, input.eventoId);
    if (existente) {
      return existente;
    }
    return this.repoAvisos.guardar(input);
  }

  async listarAvisos(usuarioId: string, soloNoLeidos = false): Promise<RespuestaAvisoDTO[]> {
    const lista = await this.repoAvisos.listarPorUsuario(usuarioId, soloNoLeidos);
    return lista.map((a) => this.mapearADTO(a));
  }

  async contarNoLeidos(usuarioId: string): Promise<RespuestaConteoNoLeidosDTO> {
    const total = await this.repoAvisos.contarNoLeidos(usuarioId);
    return { totalNoLeidos: total };
  }

  async marcarComoLeido(avisoId: string, usuarioId: string): Promise<RespuestaAvisoDTO> {
    const actualizado = await this.repoAvisos.marcarComoLeido(avisoId, usuarioId);
    return this.mapearADTO(actualizado);
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<{ actualizados: number }> {
    const cantidad = await this.repoAvisos.marcarTodosComoLeidos(usuarioId);
    return { actualizados: cantidad };
  }

  async eliminarAvisosUsuario(usuarioId: string): Promise<number> {
    return this.repoAvisos.eliminarPorUsuario(usuarioId);
  }

  async buscarPorEvento(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    return this.repoAvisos.buscarPorEvento(usuarioId, eventoId);
  }

  private mapearADTO(aviso: Aviso): RespuestaAvisoDTO {
    return {
      id: aviso.id,
      expedicionId: aviso.expedicionId,
      eventoId: aviso.eventoId,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      mensaje: aviso.mensaje,
      leido: aviso.leido,
      creadoEn: aviso.creadoEn,
    };
  }
}

/**
 * Adaptador / Generador que consume eventos del plan y recordatorios para poblarlos
 * en la bandeja in-app (HU-37). Vinculado al eventoId de eventos_plan.
 */
export class GeneradorAvisosEvento {
  constructor(private readonly servicioBandeja: ServicioBandejaAvisos) {}

  async generarDesdeEdicion(
    usuarioId: string,
    expedicionId: string,
    descripcionCambio: string,
    eventoId: string,
  ): Promise<Aviso> {
    return this.servicioBandeja.crearAviso({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'edicion',
      titulo: 'Plan de expedición modificado',
      mensaje: descripcionCambio,
    });
  }

  async generarDesdeCancelacion(
    usuarioId: string,
    expedicionId: string,
    motivo: string,
    eventoId: string,
  ): Promise<Aviso> {
    return this.servicioBandeja.crearAviso({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'cancelacion',
      titulo: 'Expedición cancelada',
      mensaje: `La expedición ha sido cancelada. Motivo: ${motivo}`,
    });
  }

  async generarDesdeAmpliacion(
    usuarioId: string,
    expedicionId: string,
    nuevaHoraLimite: string,
    eventoId: string,
  ): Promise<Aviso> {
    return this.servicioBandeja.crearAviso({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'ampliacion',
      titulo: 'Plazo de retorno ampliado',
      mensaje: `Se ha extendido el tiempo límite de retorno hasta: ${nuevaHoraLimite}.`,
    });
  }

  async generarDesdeRecordatorio(
    usuarioId: string,
    expedicionId: string,
    minutosRestantes: number,
    eventoId: string,
  ): Promise<Aviso> {
    return this.servicioBandeja.crearAviso({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'recordatorio',
      titulo: 'Recordatorio de retorno próximo',
      mensaje: `Faltan aproximadamente ${minutosRestantes} minutos para alcanzar la hora límite de tu expedición. Confirma tu retorno seguro.`,
    });
  }
}
