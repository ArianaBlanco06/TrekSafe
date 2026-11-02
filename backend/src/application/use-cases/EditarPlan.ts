import {
  ErrorEdicionPlan,
  type CodigoErrorEdicionPlan,
} from '../../domain/errors/ErrorEdicionPlan.js';
import type {
  DatosPlan,
  IExpedicionDAO,
  PlanExpedicion,
} from '../../domain/repositories/IExpedicionDAO.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { parseDecimalCoordinates } from '../../shared/utils/coordinates.js';
import { editarExpedicionSchema, type EntradaEditarExpedicion } from '../dto/expedicion.dto.js';

const RESPUESTAS: Record<CodigoErrorEdicionPlan, { estado: number; mensaje: string }> = {
  EXPEDICION_NO_ENCONTRADA: { estado: 404, mensaje: 'Expedición no encontrada' },
  PLAN_NO_EDITABLE: { estado: 409, mensaje: 'Solo puedes editar expediciones programadas' },
  VERSION_OBSOLETA: {
    estado: 409,
    mensaje: 'El plan cambió desde que lo abriste. Recárgalo e inténtalo de nuevo.',
  },
  SALIDA_YA_INICIADA: {
    estado: 422,
    mensaje: 'La hora de salida de este plan ya pasó y no se puede editar',
  },
  SALIDA_EN_PASADO: { estado: 422, mensaje: 'La nueva hora de salida debe ser futura' },
  RETORNO_INVALIDO: {
    estado: 400,
    mensaje: 'La hora de retorno debe ser posterior a la hora de salida',
  },
  TOLERANCIA_INVALIDA: { estado: 400, mensaje: 'La tolerancia debe ser mayor que cero' },
  CONTACTOS_INVALIDOS: {
    estado: 400,
    mensaje: 'Uno o más contactos no pertenecen al senderista',
  },
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de entrada inválidos' },
};

function traducir(codigo: CodigoErrorEdicionPlan, versionActual?: number): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS[codigo];
  return new ErrorAplicacion(
    estado,
    mensaje,
    codigo,
    versionActual === undefined ? undefined : { versionActual },
  );
}

function normalizarCoordenadas(valor: string | undefined): string | null {
  return valor ? (parseDecimalCoordinates(valor)?.formatted ?? null) : null;
}

function normalizarDatos(entrada: EntradaEditarExpedicion): DatosPlan {
  return {
    lugarInicio: entrada.lugarInicio,
    lugarFin: entrada.lugarFin,
    coordenadasInicio: normalizarCoordenadas(entrada.coordenadasInicio),
    coordenadasFin: normalizarCoordenadas(entrada.coordenadasFin),
    horaInicio: new Date(entrada.horaInicio).toISOString(),
    horaRetornoEstimada: new Date(entrada.horaRetornoEstimada).toISOString(),
    minutosTolerancia: entrada.minutosTolerancia,
    idsContactos: [...new Set(entrada.idsContactos)],
    nombresAcompanantes: entrada.nombresAcompanantes,
  };
}

/**
 * Edita una expedición programada de su propietario.
 * Valida antes de escribir con el reloj inyectado; la persistencia vuelve a
 * comprobar las reglas dentro de la transacción y puede rechazar por concurrencia.
 */
export class EditarPlan {
  constructor(
    private readonly dao: IExpedicionDAO,
    private readonly reloj: IReloj,
  ) {}

  async ejecutar(
    senderistaId: string,
    expedicionId: string,
    entradaSinValidar: unknown,
  ): Promise<PlanExpedicion> {
    const entrada = editarExpedicionSchema.parse(entradaSinValidar);

    // Va primero: un reintento debe devolver lo registrado aunque el plan ya haya cambiado.
    const registrada = await this.dao.buscarOperacionRegistrada(
      entrada.operacionId,
      expedicionId,
      senderistaId,
    );
    if (registrada) return this.leerPlan(expedicionId, senderistaId);

    const plan = await this.leerPlan(expedicionId, senderistaId);
    const datos = normalizarDatos(entrada);
    const ahoraMs = this.reloj.ahora().getTime();

    if (plan.estado !== 'programada') throw traducir('PLAN_NO_EDITABLE');
    if (new Date(plan.horaInicio).getTime() <= ahoraMs) throw traducir('SALIDA_YA_INICIADA');
    if (plan.version !== entrada.versionEsperada) {
      throw traducir('VERSION_OBSOLETA', plan.version);
    }
    if (new Date(datos.horaInicio).getTime() <= ahoraMs) throw traducir('SALIDA_EN_PASADO');

    try {
      await this.dao.editarPlan({
        expedicionId,
        senderistaId,
        versionEsperada: entrada.versionEsperada,
        operacionId: entrada.operacionId,
        datos,
      });
    } catch (err) {
      if (err instanceof ErrorEdicionPlan) throw traducir(err.codigo, err.versionActual);
      throw err;
    }

    return this.leerPlan(expedicionId, senderistaId);
  }

  private async leerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion> {
    const plan = await this.dao.obtenerPlan(expedicionId, senderistaId);
    if (!plan) throw traducir('EXPEDICION_NO_ENCONTRADA');
    return plan;
  }
}
