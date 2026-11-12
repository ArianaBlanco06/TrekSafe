import { ampliacionesRestantes } from '../../domain/value-objects/ampliacionRetorno.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type { EntradaConfirmarRetorno } from '../dto/expedicion.dto.js';
import type { EntradaCrearExpedicion } from '../dto/usuario.dto.js';
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
import type { IRepositorioExpedicion } from '../ports/RepositorioExpedicion.js';
import type { IRepositorioAutenticacionPostgres } from '../ports/RepositorioAutenticacionPostgres.js';
import type { IRepositorioUsuario } from '../ports/RepositorioUsuario.js';
import type { VerificarContrasena } from '../ports/seguridad.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { ServicioNotificacionRetornoSeguro } from './ServicioNotificacionRetornoSeguro.js';

export type ResumenExpedicionActiva = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  estado: string;
  version: number;
  cantidadAcompanantes: number;
  cantidadContactos: number;
  acompanantes: string[];
  contactos: { nombreCompleto: string; correoElectronico: string }[];
  /** HU-35: ampliaciones del retorno que aún puede usar. */
  ampliacionesRestantes: number;
};

export class ServicioExpedicion {
  constructor(
    private readonly repoExpedicion: IRepositorioExpedicion,
    private readonly repoUsuario: IRepositorioUsuario,
    private readonly repoAuth: IRepositorioAutenticacionPostgres,
    private readonly verificarContrasena: VerificarContrasena,
    private readonly reloj: IReloj,
    private readonly servicioNotificacionRetorno?: ServicioNotificacionRetornoSeguro,
  ) {}

  async crearExpedicion(senderistaId: string, entrada: EntradaCrearExpedicion) {
    await this.repoUsuario.verificarEsSenderista(senderistaId);

    if (await this.repoExpedicion.tieneExpedicionBloqueante(senderistaId)) {
      throw new ErrorAplicacion(
        409,
        'Ya tienes una expedición en curso o en alerta. Confirma tu retorno antes de crear otra.',
        'EXPEDICION_ACTIVA_EXISTE',
      );
    }

    const ahora = this.reloj.ahora().getTime();
    const inicioMs = new Date(entrada.horaInicio).getTime();
    const retornoMs = new Date(entrada.horaRetornoEstimada).getTime();

    if (inicioMs <= ahora) {
      throw new ErrorAplicacion(400, 'La hora de salida debe ser posterior al momento actual', 'HORA_INICIO_INVALIDA');
    }
    if (retornoMs <= ahora) {
      throw new ErrorAplicacion(
        400,
        'La hora de retorno estimada debe ser posterior al momento actual',
        'HORA_RETORNO_INVALIDA',
      );
    }

    await this.repoExpedicion.validarPropiedadContactos(senderistaId, entrada.idsContactos);

    const estado = inicioMs <= ahora + 60_000 ? 'en_progreso' : 'programada';

    const creada = await this.repoExpedicion.crearExpedicion(senderistaId, {
      lugarInicio: entrada.lugarInicio,
      lugarFin: entrada.lugarFin,
      coordenadasInicio: entrada.coordenadasInicio,
      coordenadasFin: entrada.coordenadasFin,
      horaInicio: entrada.horaInicio,
      horaRetornoEstimada: entrada.horaRetornoEstimada,
      minutosTolerancia: entrada.minutosTolerancia,
      minutosRecordatorio: entrada.minutosRecordatorio ?? 30,
      estado: estado as 'programada' | 'en_progreso',
      idsContactos: entrada.idsContactos,
      nombresAcompanantes: entrada.nombresAcompanantes,
    });
    return creada;
  }

  async listarExpediciones(senderistaId: string) {
    await this.repoUsuario.verificarEsSenderista(senderistaId);
    const filas = await this.repoExpedicion.listarExpediciones(senderistaId);
    return filas;
  }

  async obtenerExpedicionActiva(senderistaId: string): Promise<ResumenExpedicionActiva | null> {
    await this.repoUsuario.verificarEsSenderista(senderistaId);

    const fila = await this.repoExpedicion.buscarActivaPorSenderista(senderistaId);
    if (!fila) return null;

    const { acompanantes, contactos } = fila;

    return {
      id: fila.id,
      lugarInicio: fila.lugarInicio,
      lugarFin: fila.lugarFin,
      horaInicio: fila.horaInicio,
      horaRetornoEstimada: fila.horaRetornoEstimada,
      minutosTolerancia: fila.minutosTolerancia,
      fechaLimite: calcularFechaLimite(fila.horaRetornoEstimada, fila.minutosTolerancia),
      estado: fila.estado,
      version: fila.version,
      cantidadAcompanantes: acompanantes.length,
      cantidadContactos: contactos.length,
      acompanantes,
      contactos,
      ampliacionesRestantes: ampliacionesRestantes(
        fila.cantidadAmpliaciones,
      ),
    };
  }

  async confirmarRetorno(senderistaId: string, expedicionId: string, entrada: EntradaConfirmarRetorno) {
    await this.repoUsuario.verificarEsSenderista(senderistaId);

    const expedicion = await this.repoExpedicion.buscarPorIdParaSenderista(expedicionId, senderistaId);
    if (!expedicion) {
      throw new ErrorAplicacion(404, 'Expedición no encontrada', 'NO_ENCONTRADO');
    }
    if (expedicion.estado !== 'en_progreso' && expedicion.estado !== 'alerta') {
      throw new ErrorAplicacion(
        409,
        'Solo puedes confirmar retorno en expediciones en curso o en alerta',
        'EXPEDICION_NO_ACTIVA',
      );
    }

    const usuario = await this.repoAuth.buscarUsuarioPorId(senderistaId);
    if (!usuario) {
      throw new ErrorAplicacion(401, 'Usuario no encontrado', 'NO_AUTORIZADO');
    }

    const valida = await this.verificarContrasena(entrada.contrasena, usuario.hashContrasena);
    if (!valida) {
      throw new ErrorAplicacion(401, 'Contraseña incorrecta', 'CONTRASENA_INVALIDA');
    }

    const eraAlerta = expedicion.estado === 'alerta';
    const completada = await this.repoExpedicion.completarConfirmacionRetorno(expedicionId, senderistaId);
    const confirmadoEn = completada.actualizadoEn ?? this.reloj.ahora().toISOString();

    // Notificar retorno seguro a contactos mediante el Outbox (HU-44)
    if (this.servicioNotificacionRetorno) {
      try {
        await this.servicioNotificacionRetorno.notificarRetornoSeguro(
          expedicionId,
          confirmadoEn,
          eraAlerta,
        );
      } catch (err) {
        console.error(`[RetornoSeguro] Error al programar outbox para expedición ${expedicionId}:`, err);
      }
    }

    return {
      expedicion: completada,
      confirmadoEn,
    };
  }

  async obtenerHistorialExpediciones(senderistaId: string) {
    await this.repoUsuario.verificarEsSenderista(senderistaId);

    const filas = await this.repoExpedicion.listarExpedicionesCompletadas(senderistaId);
    const expediciones = filas;
    const destinos = new Set(expediciones.map((e) => e.lugarFin));

    let totalHoras = 0;
    for (const exp of expediciones) {
      const ms =
        new Date(exp.horaRetornoEstimada).getTime() - new Date(exp.horaInicio).getTime();
      totalHoras += ms / 3_600_000;
    }

    return {
      expediciones,
      estadisticas: {
        totalCompletadas: expediciones.length,
        destinosUnicos: destinos.size,
        promedioHoras:
          expediciones.length > 0
            ? Math.round((totalHoras / expediciones.length) * 10) / 10
            : 0,
        ultimaCompletadaEn: expediciones[0]?.actualizadoEn ?? null,
      },
    };
  }
}
