import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  EntradaConfirmarAlerta,
  ConsultaListarExpediciones,
  EntradaActualizarBitacoraRescate,
} from '../dto/rescate.dto.js';
import { RepositorioAlerta } from '../../infrastructure/repositories/RepositorioAlerta.js';
import { calcularFechaLimite } from '../../infrastructure/repositories/RepositorioExpedicion.js';
import { RepositorioRescate } from '../../infrastructure/repositories/RepositorioRescate.js';
import { RepositorioUsuario } from '../../infrastructure/repositories/RepositorioUsuario.js';
import { RepositorioAuditoriaAccesoMedico } from '../../infrastructure/repositories/RepositorioAuditoriaAccesoMedico.js';
import type { NivelRiesgoExpedicion } from '../../domain/value-objects/enums.js';

const UMBRAL_URGENCIA_MS = 30 * 60_000;

export type ItemAlertaRescate = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  enAlertaDesde: string;
  confirmadoPorMi: boolean;
  confirmadoEn: string | null;
  estadoRescate: string | null;
};

export type ItemExpedicionRescate = {
  expedicionId: string;
  estado: 'en_progreso' | 'alerta';
  nivelRiesgo: NivelRiesgoExpedicion;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  minutosRestantes: number | null;
  minutosExcedidos: number | null;
  enAlertaDesde: string | null;
  confirmadoPorMi: boolean;
  confirmadoEn: string | null;
  estadoRescate: string | null;
};

const ORDEN_RIESGO: Record<NivelRiesgoExpedicion, number> = {
  rojo: 0,
  amarillo: 1,
  verde: 2,
};

export function calcularNivelRiesgoExpedicion(
  estado: 'en_progreso' | 'alerta',
  fechaLimite: string,
  ahora = Date.now(),
): { nivelRiesgo: NivelRiesgoExpedicion; minutosRestantes: number | null; minutosExcedidos: number | null } {
  const limiteMs = new Date(fechaLimite).getTime();
  const restantesMs = limiteMs - ahora;

  if (estado === 'alerta' || restantesMs <= 0) {
    const excedidoMs = Math.max(ahora - limiteMs, 0);
    return {
      nivelRiesgo: 'rojo',
      minutosRestantes: null,
      minutosExcedidos: Math.ceil(excedidoMs / 60_000),
    };
  }

  if (restantesMs <= UMBRAL_URGENCIA_MS) {
    return {
      nivelRiesgo: 'amarillo',
      minutosRestantes: Math.ceil(restantesMs / 60_000),
      minutosExcedidos: null,
    };
  }

  return {
    nivelRiesgo: 'verde',
    minutosRestantes: Math.ceil(restantesMs / 60_000),
    minutosExcedidos: null,
  };
}

export type DetalleAlertaRescate = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  horaInicio: string;
  horaRetornoEstimada: string;
  minutosTolerancia: number;
  fechaLimite: string;
  enAlertaDesde: string;
  acompanantes: string[];
  contactosEmergencia: { nombreCompleto: string; telefono: string; parentesco: string; correoElectronico: string }[];
  fichaMedica: {
    tipoSangre: string;
    alergias: string;
    condiciones: string;
    medicamentos: string;
  } | null;
  bitacoraRescate: {
    id: string;
    estadoRescate: string;
    notas: string | null;
    actualizadoEn: string;
  } | null;
};

export type ItemHistorialRescatista = {
  expedicionId: string;
  nombreCompletoSenderista: string;
  telefonoSenderista: string;
  lugarInicio: string;
  lugarFin: string;
  horaInicio: string;
  horaRetornoEstimada: string;
  fechaLimite: string;
  completadaEn: string;
  estadoRescate: string;
  confirmadoEn: string;
  notas: string | null;
};

export class ServicioRescate {
  constructor(
    private readonly repo = new RepositorioRescate(),
    private readonly repoAlerta = new RepositorioAlerta(),
    private readonly repoUsuario = new RepositorioUsuario(),
    private readonly repoAuditoria = new RepositorioAuditoriaAccesoMedico(),
  ) {}

  async listarExpediciones(
    rescatistaId: string,
    consulta: ConsultaListarExpediciones = {},
  ): Promise<ItemExpedicionRescate[]> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const expediciones = await this.repo.listarExpedicionesMonitor(consulta.zona);
    const confirmaciones = await this.repo.buscarConfirmacionesPorExpediciones(
      expediciones.map((fila) => fila.id),
      rescatistaId,
    );

    const items: ItemExpedicionRescate[] = [];

    for (const fila of expediciones) {
      const senderista = Array.isArray(fila.perfiles_senderista)
        ? fila.perfiles_senderista[0]
        : fila.perfiles_senderista;
      if (!senderista) continue;

      const fechaLimite = calcularFechaLimite(fila.hora_retorno_estimada, fila.minutos_tolerancia);
      const { nivelRiesgo, minutosRestantes, minutosExcedidos } = calcularNivelRiesgoExpedicion(
        fila.estado,
        fechaLimite,
      );
      const confirmacion = confirmaciones.get(fila.id) ?? null;

      items.push({
        expedicionId: fila.id,
        estado: fila.estado,
        nivelRiesgo,
        nombreCompletoSenderista: senderista.nombre_completo,
        telefonoSenderista: senderista.telefono,
        lugarInicio: fila.lugar_inicio,
        lugarFin: fila.lugar_fin,
        coordenadasInicio: fila.coordenadas_inicio ?? null,
        coordenadasFin: fila.coordenadas_fin ?? null,
        horaInicio: fila.hora_inicio,
        horaRetornoEstimada: fila.hora_retorno_estimada,
        fechaLimite,
        minutosRestantes,
        minutosExcedidos,
        enAlertaDesde: fila.estado === 'alerta' ? fila.actualizado_en : null,
        confirmadoPorMi: confirmacion !== null,
        confirmadoEn: confirmacion?.actualizado_en ?? null,
        estadoRescate: confirmacion?.estado_rescate ?? null,
      });
    }

    return items.sort((a, b) => {
      const difRiesgo = ORDEN_RIESGO[a.nivelRiesgo] - ORDEN_RIESGO[b.nivelRiesgo];
      if (difRiesgo !== 0) return difRiesgo;
      return new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime();
    });
  }

  async listarAlertas(rescatistaId: string): Promise<ItemAlertaRescate[]> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const expediciones = await this.repo.listarExpedicionesEnAlerta();
    const confirmaciones = await this.repo.buscarConfirmacionesPorExpediciones(
      expediciones.map((fila) => fila.id),
      rescatistaId,
    );

    const items: ItemAlertaRescate[] = [];

    for (const fila of expediciones) {
      const senderista = Array.isArray(fila.perfiles_senderista)
        ? fila.perfiles_senderista[0]
        : fila.perfiles_senderista;
      if (!senderista) continue;

      const confirmacion = confirmaciones.get(fila.id) ?? null;

      items.push({
        expedicionId: fila.id,
        nombreCompletoSenderista: senderista.nombre_completo,
        telefonoSenderista: senderista.telefono,
        lugarInicio: fila.lugar_inicio,
        lugarFin: fila.lugar_fin,
        horaInicio: fila.hora_inicio,
        horaRetornoEstimada: fila.hora_retorno_estimada,
        fechaLimite: calcularFechaLimite(fila.hora_retorno_estimada, fila.minutos_tolerancia),
        enAlertaDesde: fila.actualizado_en,
        confirmadoPorMi: confirmacion !== null,
        confirmadoEn: confirmacion?.actualizado_en ?? null,
        estadoRescate: confirmacion?.estado_rescate ?? null,
      });
    }

    return items;
  }

  async obtenerDetalleAlerta(rescatistaId: string, expedicionId: string): Promise<DetalleAlertaRescate> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const contexto = await this.repoAlerta.buscarContextoAlertaRescate(expedicionId);
    if (!contexto) {
      throw new ErrorAplicacion(404, 'Alerta no encontrada o expedición ya no está en alerta', 'NO_ENCONTRADO');
    }

    const registroMedico = await this.repoUsuario.obtenerFichaMedica(contexto.senderistaId);
    if (registroMedico?.consentimientoFirmado) {
      await this.repoAuditoria.registrarAcceso({
        senderistaId: contexto.senderistaId,
        expedicionId,
        idAccesor: rescatistaId,
        rolAccesor: 'rescatista',
        tipoAcceso: 'dossier_alerta_medico',
      });
    }

    const confirmacion = await this.repo.buscarConfirmacion(expedicionId, rescatistaId);
    const expedicion = await this.repo.buscarExpedicionEnAlerta(expedicionId);

    return {
      expedicionId: contexto.expedicionId,
      nombreCompletoSenderista: contexto.nombreCompletoSenderista,
      telefonoSenderista: contexto.telefonoSenderista,
      lugarInicio: contexto.lugarInicio,
      lugarFin: contexto.lugarFin,
      coordenadasInicio: contexto.coordenadasInicio,
      coordenadasFin: contexto.coordenadasFin,
      horaInicio: contexto.horaInicio,
      horaRetornoEstimada: contexto.horaRetornoEstimada,
      minutosTolerancia: contexto.minutosTolerancia,
      fechaLimite: contexto.fechaLimite,
      enAlertaDesde: expedicion?.actualizado_en ?? new Date().toISOString(),
      acompanantes: contexto.acompanantes,
      contactosEmergencia: contexto.contactos.map((c, i) => ({
        nombreCompleto: c.nombreCompleto,
        correoElectronico: c.correoElectronico,
        telefono: contexto.contactosEmergencia[i]?.telefono ?? '',
        parentesco: c.parentesco,
      })),
      fichaMedica: registroMedico?.consentimientoFirmado
        ? {
            tipoSangre: registroMedico.tipoSangre,
            alergias: registroMedico.carga.alergias,
            condiciones: registroMedico.carga.condiciones,
            medicamentos: registroMedico.carga.medicamentos,
          }
        : null,
      bitacoraRescate: confirmacion
        ? {
            id: confirmacion.id,
            estadoRescate: confirmacion.estado_rescate,
            notas: confirmacion.notas,
            actualizadoEn: confirmacion.actualizado_en,
          }
        : null,
    };
  }

  async actualizarBitacoraRescate(
    rescatistaId: string,
    expedicionId: string,
    entrada: EntradaActualizarBitacoraRescate,
  ) {
    await this.repo.verificarEsRescatista(rescatistaId);

    const expedicion = await this.repo.buscarExpedicionEnAlerta(expedicionId);
    if (!expedicion) {
      throw new ErrorAplicacion(404, 'Alerta no encontrada o expedición ya no está en alerta', 'NO_ENCONTRADO');
    }

    const bitacora = await this.repo.actualizarBitacoraRescate(expedicionId, rescatistaId, {
      estadoRescate: entrada.estadoRescate,
      notas: entrada.notas,
    });

    return {
      mensaje: 'Bitácora actualizada',
      bitacoraRescate: {
        id: bitacora.id,
        expedicionId: bitacora.expedicion_id,
        estadoRescate: bitacora.estado_rescate,
        notas: bitacora.notas,
        actualizadoEn: bitacora.actualizado_en,
      },
    };
  }

  async confirmarAlerta(
    rescatistaId: string,
    expedicionId: string,
    entrada: EntradaConfirmarAlerta,
  ) {
    await this.repo.verificarEsRescatista(rescatistaId);

    const expedicion = await this.repo.buscarExpedicionEnAlerta(expedicionId);
    if (!expedicion) {
      throw new ErrorAplicacion(404, 'Alerta no encontrada o expedición ya no está en alerta', 'NO_ENCONTRADO');
    }

    const existente = await this.repo.buscarConfirmacion(expedicionId, rescatistaId);
    if (existente) {
      throw new ErrorAplicacion(409, 'Ya confirmaste la recepción de esta alerta', 'YA_CONFIRMADO');
    }

    const bitacora = await this.repo.crearConfirmacion(expedicionId, rescatistaId, entrada.notas);

    return {
      mensaje: 'Recepción de alerta confirmada',
      confirmacion: {
        id: bitacora.id,
        expedicionId: bitacora.expedicion_id,
        estadoRescate: bitacora.estado_rescate,
        confirmadoEn: bitacora.actualizado_en,
        notas: bitacora.notas,
      },
    };
  }

  async listarHistorial(rescatistaId: string): Promise<ItemHistorialRescatista[]> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const filas = await this.repo.listarHistorialCompletadas(rescatistaId);
    const items: ItemHistorialRescatista[] = [];

    for (const fila of filas) {
      const expedicion = fila.expediciones;
      if (!expedicion) continue;

      const senderista = Array.isArray(expedicion.perfiles_senderista)
        ? expedicion.perfiles_senderista[0]
        : expedicion.perfiles_senderista;
      if (!senderista) continue;

      items.push({
        expedicionId: expedicion.id,
        nombreCompletoSenderista: senderista.nombre_completo,
        telefonoSenderista: senderista.telefono,
        lugarInicio: expedicion.lugar_inicio,
        lugarFin: expedicion.lugar_fin,
        horaInicio: expedicion.hora_inicio,
        horaRetornoEstimada: expedicion.hora_retorno_estimada,
        fechaLimite: calcularFechaLimite(expedicion.hora_retorno_estimada, expedicion.minutos_tolerancia),
        completadaEn: expedicion.actualizado_en,
        estadoRescate: fila.estado_rescate,
        confirmadoEn: fila.actualizado_en,
        notas: fila.notas,
      });
    }

    return items.sort(
      (a, b) => new Date(b.completadaEn).getTime() - new Date(a.completadaEn).getTime(),
    );
  }
}
