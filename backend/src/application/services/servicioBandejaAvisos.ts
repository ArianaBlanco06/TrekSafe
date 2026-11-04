import type { Aviso } from '../../domain/entities/Aviso.js';
import type { INotificacionDAO } from '../../domain/repositories/INotificacionDAO.js';
import { RepositorioAvisosSupabase } from '../../infrastructure/repositories/RepositorioAvisosSupabase.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  EventoExpedicionEntradaDTO,
  ListadoAvisosDTO,
  RespuestaAvisoDTO,
} from '../dto/aviso.dto.js';

function mapearADTO(aviso: Aviso): RespuestaAvisoDTO {
  return {
    id: aviso.id,
    usuarioId: aviso.usuarioId,
    expedicionId: aviso.expedicionId ?? null,
    eventoId: aviso.eventoId ?? null,
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    mensaje: aviso.mensaje,
    leido: aviso.leido,
    creadoEn: aviso.creadoEn,
  };
}

/**
 * Servicio principal de la Bandeja de Avisos (HU-37)
 * Implementa el manejo de persistencia mediante INotificacionDAO (DIP).
 */
export class ServicioBandejaAvisos {
  constructor(
    private readonly notificacionDAO: INotificacionDAO = new RepositorioAvisosSupabase(),
  ) {}

  /**
   * CA-01: Consulta de avisos
   * Obtiene la lista de avisos del usuario autenticado junto al conteo de no leídos.
   */
  async listarAvisos(usuarioId: string, soloNoLeidos = false): Promise<ListadoAvisosDTO> {
    if (!usuarioId) {
      throw new ErrorAplicacion(400, 'El ID de usuario es obligatorio', 'USUARIO_REQUERIDO');
    }

    const [avisos, conteoNoLeidos] = await Promise.all([
      this.notificacionDAO.listarPorUsuario(usuarioId, soloNoLeidos),
      this.notificacionDAO.contarNoLeidos(usuarioId),
    ]);

    return {
      avisos: avisos.map(mapearADTO),
      conteoNoLeidos,
    };
  }

  /**
   * CA-02: Persistencia de lectura
   * Marca un aviso individual como leído.
   */
  async marcarComoLeido(avisoId: string, usuarioId: string): Promise<{ exito: boolean }> {
    if (!avisoId || !usuarioId) {
      throw new ErrorAplicacion(400, 'Datos incompletos para actualizar aviso', 'DATOS_INVALIDOS');
    }

    const aviso = await this.notificacionDAO.obtenerPorId(avisoId, usuarioId);
    if (!aviso) {
      throw new ErrorAplicacion(404, 'Aviso no encontrado o no pertenece al usuario', 'AVISO_NO_ENCONTRADO');
    }

    const exito = await this.notificacionDAO.marcarComoLeido(avisoId, usuarioId);
    return { exito };
  }

  /**
   * CA-02: Persistencia de lectura
   * Marca todos los avisos pendientes del usuario como leídos.
   */
  async marcarTodosComoLeidos(usuarioId: string): Promise<{ marcados: number }> {
    if (!usuarioId) {
      throw new ErrorAplicacion(400, 'El ID de usuario es obligatorio', 'USUARIO_REQUERIDO');
    }

    const marcados = await this.notificacionDAO.marcarTodosComoLeidos(usuarioId);
    return { marcados };
  }

  /**
   * Busca un aviso específico por clave de evento e ID de usuario.
   */
  async buscarPorEvento(usuarioId: string, eventoId: string): Promise<RespuestaAvisoDTO | null> {
    if (!usuarioId || !eventoId) return null;
    const aviso = await this.notificacionDAO.obtenerPorEventoId(usuarioId, eventoId);
    return aviso ? mapearADTO(aviso) : null;
  }

  /**
   * CA-03 & Generador de Avisos por Evento (DoD Backlog):
   * Genera un aviso a partir de un evento de expedición, asegurando que:
   * 1. Pertenezca únicamente al usuario destinatario (autorización).
   * 2. No se creen avisos duplicados si el evento se procesa más de una vez (idempotencia/unicidad).
   *
   * @param evento Datos del evento emitido (HU-26, HU-27, HU-35 o HU-38)
   */
  async registrarAvisoDesdeEvento(evento: EventoExpedicionEntradaDTO): Promise<RespuestaAvisoDTO> {
    if (!evento.usuarioId || !evento.tipo || !evento.titulo || !evento.mensaje) {
      throw new ErrorAplicacion(400, 'Los datos del evento de aviso están incompletos', 'EVENTO_INVALIDO');
    }

    // Si no se proporcionó un eventoId explícito, generar una clave idempotente
    const eventoId = evento.eventoId ?? `${evento.tipo}:${evento.expedicionId ?? 'global'}:${evento.titulo}`;

    // Verificar si ya existe un aviso generado para este evento y usuario (CA-03)
    const existente = await this.notificacionDAO.obtenerPorEventoId(evento.usuarioId, eventoId);
    if (existente) {
      return mapearADTO(existente);
    }

    const aviso = await this.notificacionDAO.crear({
      usuarioId: evento.usuarioId,
      expedicionId: evento.expedicionId ?? null,
      eventoId,
      tipo: evento.tipo,
      titulo: evento.titulo.trim(),
      mensaje: evento.mensaje.trim(),
    });

    return mapearADTO(aviso);
  }
}

/**
 * Generador de avisos por evento (requerido explícitamente por el Product Backlog)
 */
export class GeneradorAvisosEvento {
  constructor(private readonly servicioBandeja: ServicioBandejaAvisos) {}

  generarDesdeEdicion(usuarioId: string, expedicionId: string, detalle: string, eventoId?: string) {
    return this.servicioBandeja.registrarAvisoDesdeEvento({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'EDICION',
      titulo: 'Expedición modificada',
      mensaje: detalle,
    });
  }

  generarDesdeCancelacion(usuarioId: string, expedicionId: string, motivo: string, eventoId?: string) {
    return this.servicioBandeja.registrarAvisoDesdeEvento({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'CANCELACION',
      titulo: 'Expedición cancelada',
      mensaje: motivo,
    });
  }

  generarDesdeAmpliacion(usuarioId: string, expedicionId: string, nuevaHoraRetorno: string, eventoId?: string) {
    return this.servicioBandeja.registrarAvisoDesdeEvento({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'AMPLIACION',
      titulo: 'Retorno de expedición ampliado',
      mensaje: `Se ha extendido la hora estimada de retorno a: ${nuevaHoraRetorno}`,
    });
  }

  generarDesdeRecordatorio(usuarioId: string, expedicionId: string, minutosRestantes: number, eventoId?: string) {
    return this.servicioBandeja.registrarAvisoDesdeEvento({
      usuarioId,
      expedicionId,
      eventoId,
      tipo: 'RECORDATORIO',
      titulo: 'Recordatorio de retorno próximo',
      mensaje: `Faltan aproximadamente ${minutosRestantes} minutos para la hora estimada de retorno.`,
    });
  }
}
