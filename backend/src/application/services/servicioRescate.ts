import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  EntradaConfirmarAlerta,
  ConsultaListarExpediciones,
  ConsultaListarAlertas,
  EntradaActualizarBitacoraRescate,
} from '../dto/rescate.dto.js';
import type { IRepositorioAlerta } from '../ports/RepositorioAlerta.js';
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import type { IRepositorioRescate } from '../ports/RepositorioRescate.js';
import type { IRepositorioUsuario } from '../ports/RepositorioUsuario.js';
import type { IRepositorioAuditoriaAccesoMedico } from '../ports/RepositorioAuditoriaAccesoMedico.js';
import type { NivelRiesgoExpedicion } from '../../domain/value-objects/enums.js';
import type { Coordinacion, IIncidenteDAO } from '../../domain/repositories/IIncidenteDAO.js';
import { OrdenadorAlertas } from '../../domain/services/OrdenadorAlertas.js';
import {
  CRITERIO_PRIORIDAD_PREDETERMINADO,
  type CriterioPrioridad,
  type IEstrategiaPrioridad,
} from '../../domain/strategies/IEstrategiaPrioridad.js';
import { PorTiempoExcedido } from '../../domain/strategies/PorTiempoExcedido.js';
import { PorTamanoGrupo } from '../../domain/strategies/PorTamanoGrupo.js';

const UMBRAL_URGENCIA_MS = 30 * 60_000;

const ESTRATEGIAS_PRIORIDAD: Readonly<Record<CriterioPrioridad, IEstrategiaPrioridad>> = {
  tiempo_excedido: new PorTiempoExcedido(),
  tamano_grupo: new PorTamanoGrupo(),
};

export type ItemAlertaRescate = {
  expedicionId: string;
  numeroParticipantes: number;
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
  /** Responsable vigente (HU-39) o `null` si no hay incidente. Sin datos médicos. */
  coordinacion: Coordinacion | null;
};

export type ItemExpedicionRescate = {
  expedicionId: string;
  numeroParticipantes: number;
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
  coordinacion: Coordinacion | null;
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
  coordinacion: Coordinacion | null;
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
    private readonly repo: IRepositorioRescate,
    private readonly repoAlerta: IRepositorioAlerta,
    private readonly repoUsuario: IRepositorioUsuario,
    private readonly repoAuditoria: IRepositorioAuditoriaAccesoMedico,
    private readonly incidentes: IIncidenteDAO,
    private readonly reloj: IReloj = { ahora: () => new Date() },
    private readonly estrategiasPrioridad = ESTRATEGIAS_PRIORIDAD,
  ) {}

  async listarExpediciones(
    rescatistaId: string,
    consulta: ConsultaListarExpediciones = {},
  ): Promise<ItemExpedicionRescate[]> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const expediciones = await this.repo.listarExpedicionesMonitor(consulta.zona);
    const ids = expediciones.map((fila) => fila.id);
    // Una sola lectura de coordinaciones por lista (sin N+1).
    const [confirmaciones, coordinaciones] = await Promise.all([
      this.repo.buscarConfirmacionesPorExpediciones(ids, rescatistaId),
      this.incidentes.leerCoordinaciones(ids, rescatistaId),
    ]);

    const items: ItemExpedicionRescate[] = [];

    for (const fila of expediciones) {
      const senderista = fila.senderista;
      if (!senderista) continue;

      const fechaLimite = calcularFechaLimite(fila.horaRetornoEstimada, fila.minutosTolerancia);
      const { nivelRiesgo, minutosRestantes, minutosExcedidos } = calcularNivelRiesgoExpedicion(
        fila.estado,
        fechaLimite,
        this.reloj.ahora().getTime(),
      );
      const confirmacion = confirmaciones.get(fila.id) ?? null;

      items.push({
        expedicionId: fila.id,
        numeroParticipantes: fila.numeroParticipantes ?? 1,
        estado: fila.estado,
        nivelRiesgo,
        nombreCompletoSenderista: senderista.nombreCompleto,
        telefonoSenderista: senderista.telefono,
        lugarInicio: fila.lugarInicio,
        lugarFin: fila.lugarFin,
        coordenadasInicio: fila.coordenadasInicio ?? null,
        coordenadasFin: fila.coordenadasFin ?? null,
        horaInicio: fila.horaInicio,
        horaRetornoEstimada: fila.horaRetornoEstimada,
        fechaLimite,
        minutosRestantes,
        minutosExcedidos,
        enAlertaDesde: fila.estado === 'alerta' ? fila.actualizadoEn : null,
        confirmadoPorMi: confirmacion !== null,
        confirmadoEn: confirmacion?.actualizadoEn ?? null,
        estadoRescate: confirmacion?.estadoRescate ?? null,
        coordinacion: coordinaciones.get(fila.id) ?? null,
      });
    }

    const criterio = consulta.criterio ?? CRITERIO_PRIORIDAD_PREDETERMINADO;
    const ordenador = new OrdenadorAlertas(this.estrategiasPrioridad[criterio]);
    return ordenador.ordenar(items, (item) => ORDEN_RIESGO[item.nivelRiesgo]);
  }

  async listarAlertas(
    rescatistaId: string,
    consulta: ConsultaListarAlertas = {},
  ): Promise<ItemAlertaRescate[]> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const expediciones = await this.repo.listarExpedicionesEnAlerta();
    const ids = expediciones.map((fila) => fila.id);
    const [confirmaciones, coordinaciones] = await Promise.all([
      this.repo.buscarConfirmacionesPorExpediciones(ids, rescatistaId),
      this.incidentes.leerCoordinaciones(ids, rescatistaId),
    ]);

    const items: ItemAlertaRescate[] = [];

    for (const fila of expediciones) {
      const senderista = fila.senderista;
      if (!senderista) continue;

      const confirmacion = confirmaciones.get(fila.id) ?? null;

      items.push({
        expedicionId: fila.id,
        numeroParticipantes: fila.numeroParticipantes ?? 1,
        nombreCompletoSenderista: senderista.nombreCompleto,
        telefonoSenderista: senderista.telefono,
        lugarInicio: fila.lugarInicio,
        lugarFin: fila.lugarFin,
        horaInicio: fila.horaInicio,
        horaRetornoEstimada: fila.horaRetornoEstimada,
        fechaLimite: calcularFechaLimite(fila.horaRetornoEstimada, fila.minutosTolerancia),
        enAlertaDesde: fila.actualizadoEn,
        confirmadoPorMi: confirmacion !== null,
        confirmadoEn: confirmacion?.actualizadoEn ?? null,
        estadoRescate: confirmacion?.estadoRescate ?? null,
        coordinacion: coordinaciones.get(fila.id) ?? null,
      });
    }

    const criterio = consulta.criterio ?? CRITERIO_PRIORIDAD_PREDETERMINADO;
    return new OrdenadorAlertas(this.estrategiasPrioridad[criterio]).ordenar(items);
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
    const coordinaciones = await this.incidentes.leerCoordinaciones([expedicionId], rescatistaId);

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
      enAlertaDesde: expedicion?.actualizadoEn ?? this.reloj.ahora().toISOString(),
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
            estadoRescate: confirmacion.estadoRescate,
            notas: confirmacion.notas,
            actualizadoEn: confirmacion.actualizadoEn,
          }
        : null,
      coordinacion: coordinaciones.get(expedicionId) ?? null,
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
        expedicionId: bitacora.expedicionId,
        estadoRescate: bitacora.estadoRescate,
        notas: bitacora.notas,
        actualizadoEn: bitacora.actualizadoEn,
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
        expedicionId: bitacora.expedicionId,
        estadoRescate: bitacora.estadoRescate,
        confirmadoEn: bitacora.actualizadoEn,
        notas: bitacora.notas,
      },
    };
  }

  async listarHistorial(rescatistaId: string): Promise<ItemHistorialRescatista[]> {
    await this.repo.verificarEsRescatista(rescatistaId);

    const filas = await this.repo.listarHistorialCompletadas(rescatistaId);
    const items: ItemHistorialRescatista[] = [];

    for (const fila of filas) {
      const expedicion = fila.expedicion;
      if (!expedicion) continue;

      const senderista = expedicion.senderista;
      if (!senderista) continue;

      items.push({
        expedicionId: expedicion.id,
        nombreCompletoSenderista: senderista.nombreCompleto,
        telefonoSenderista: senderista.telefono,
        lugarInicio: expedicion.lugarInicio,
        lugarFin: expedicion.lugarFin,
        horaInicio: expedicion.horaInicio,
        horaRetornoEstimada: expedicion.horaRetornoEstimada,
        fechaLimite: calcularFechaLimite(expedicion.horaRetornoEstimada, expedicion.minutosTolerancia),
        completadaEn: expedicion.actualizadoEn,
        estadoRescate: fila.estadoRescate,
        confirmadoEn: fila.actualizadoEn,
        notas: fila.notas,
      });
    }

    return items.sort(
      (a, b) => new Date(b.completadaEn).getTime() - new Date(a.completadaEn).getTime(),
    );
  }
}
