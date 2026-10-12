import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type { EntradaConfirmarRetorno } from '../dto/expedicion.dto.js';
import type { EntradaCrearExpedicion } from '../dto/usuario.dto.js';
import {
  calcularFechaLimite,
  RepositorioExpedicion,
} from '../../infrastructure/repositories/RepositorioExpedicion.js';
import { RepositorioAutenticacionPostgres } from '../../infrastructure/repositories/RepositorioAutenticacionPostgres.js';
import { RepositorioUsuario } from '../../infrastructure/repositories/RepositorioUsuario.js';
import { verificarContrasena } from '../../infrastructure/security/password.js';

export type ResumenExpedicionActiva = {
  id: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  estado: string;
  cantidadAcompanantes: number;
  cantidadContactos: number;
  acompanantes: string[];
  contactos: { nombreCompleto: string; correoElectronico: string }[];
};

export class ServicioExpedicion {
  constructor(
    private readonly repoExpedicion = new RepositorioExpedicion(),
    private readonly repoUsuario = new RepositorioUsuario(),
    private readonly repoAuth = new RepositorioAutenticacionPostgres(),
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

    const ahora = Date.now();
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
      estado: estado as 'programada' | 'en_progreso',
      idsContactos: entrada.idsContactos,
      nombresAcompanantes: entrada.nombresAcompanantes,
    });
    return mapearExpedicion(creada);
  }

  async listarExpediciones(senderistaId: string) {
    await this.repoUsuario.verificarEsSenderista(senderistaId);
    const filas = await this.repoExpedicion.listarExpediciones(senderistaId);
    return filas.map(mapearExpedicion);
  }

  async obtenerExpedicionActiva(senderistaId: string): Promise<ResumenExpedicionActiva | null> {
    await this.repoUsuario.verificarEsSenderista(senderistaId);

    const fila = await this.repoExpedicion.buscarActivaPorSenderista(senderistaId);
    if (!fila) return null;

    const acompanantes = fila.acompanantes_expedicion.map((a) => a.nombre_acompanante);
    const contactos = fila.vinculos_expedicion_contacto
      .map((enlace) => enlace.contactos_emergencia)
      .filter(
        (c): c is { nombre_completo: string; correo_electronico: string } => c !== null,
      )
      .map((c) => ({ nombreCompleto: c.nombre_completo, correoElectronico: c.correo_electronico }));

    return {
      id: fila.id,
      lugarInicio: fila.lugar_inicio,
      lugarFin: fila.lugar_fin,
      horaInicio: fila.hora_inicio,
      horaRetornoEstimada: fila.hora_retorno_estimada,
      minutosTolerancia: fila.minutos_tolerancia,
      fechaLimite: calcularFechaLimite(fila.hora_retorno_estimada, fila.minutos_tolerancia),
      estado: fila.estado,
      cantidadAcompanantes: acompanantes.length,
      cantidadContactos: contactos.length,
      acompanantes,
      contactos,
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

    const valida = await verificarContrasena(entrada.contrasena, usuario.hash_contrasena);
    if (!valida) {
      throw new ErrorAplicacion(401, 'Contraseña incorrecta', 'CONTRASENA_INVALIDA');
    }

    const completada = await this.repoExpedicion.completarConfirmacionRetorno(expedicionId, senderistaId);

    return {
      expedicion: mapearExpedicion(completada),
      confirmadoEn: completada.actualizado_en ?? new Date().toISOString(),
    };
  }

  async obtenerHistorialExpediciones(senderistaId: string) {
    await this.repoUsuario.verificarEsSenderista(senderistaId);

    const filas = await this.repoExpedicion.listarExpedicionesCompletadas(senderistaId);
    const expediciones = filas.map(mapearExpedicion);
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

function mapearExpedicion(fila: {
  id: string;
  lugar_inicio: string;
  lugar_fin: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  estado: string;
  creado_en?: string;
  actualizado_en?: string;
}) {
  return {
    id: fila.id,
    lugarInicio: fila.lugar_inicio,
    lugarFin: fila.lugar_fin,
    horaInicio: fila.hora_inicio,
    horaRetornoEstimada: fila.hora_retorno_estimada,
    minutosTolerancia: fila.minutos_tolerancia,
    estado: fila.estado,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
