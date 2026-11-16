import {
  ErrorAmpliacionRetorno,
  type CodigoErrorAmpliacionRetorno,
} from '../../domain/errors/ErrorAmpliacionRetorno.js';
import type { IExpedicionDAO } from '../../domain/repositories/IExpedicionDAO.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import {
  ESTADO_AMPLIABLE,
  ampliacionesRestantes,
  plazoVigente,
} from '../../domain/value-objects/ampliacionRetorno.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  ComandoAmpliarRetorno,
  ResultadoAmpliarRetorno,
} from '../commands/ComandoAmpliarRetorno.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';

const RESPUESTAS: Record<CodigoErrorAmpliacionRetorno, { estado: number; mensaje: string }> = {
  EXPEDICION_NO_ENCONTRADA: { estado: 404, mensaje: 'Expedición no encontrada' },
  DATOS_INVALIDOS: { estado: 400, mensaje: 'Datos de entrada inválidos' },
  RETORNO_NO_AMPLIABLE: {
    estado: 409,
    mensaje: 'Solo puedes ampliar el retorno de una expedición en curso',
  },
  ALERTA_YA_DECLARADA: {
    estado: 409,
    mensaje: 'La alerta ya se declaró: confirma tu retorno en lugar de ampliarlo',
  },
  PLAZO_VENCIDO: {
    estado: 409,
    mensaje: 'Tu plazo ya venció y no se puede ampliar',
  },
  VERSION_OBSOLETA: {
    estado: 409,
    mensaje: 'La expedición cambió desde que la abriste. Recárgala e inténtalo de nuevo.',
  },
  AMPLIACION_NO_DISPONIBLE: {
    estado: 409,
    mensaje: 'Ya usaste la ampliación disponible para esta expedición',
  },
};

function traducir(codigo: CodigoErrorAmpliacionRetorno, versionActual?: number): ErrorAplicacion {
  const { estado, mensaje } = RESPUESTAS[codigo];
  return new ErrorAplicacion(
    estado,
    mensaje,
    codigo,
    versionActual === undefined ? undefined : { versionActual },
  );
}

/**
 * Ejecutor del comando `ComandoAmpliarRetorno` (HU-35).
 *
 * Valida antes de escribir con el reloj inyectado y la misma fórmula del límite que el
 * resto del backend (`plazoVigente` → `calcularFechaLimite`). La persistencia repite
 * todas las reglas en una transacción, con la fila bloqueada y el reloj de la base, y
 * aplica un compare-and-swap sobre estado y versión: si el cron declaró la alerta
 * entretanto, la ampliación se rechaza. No envía correos: HU-37 leerá el evento.
 *
 * Idempotente: si la operación ya está registrada, se omiten las comprobaciones previas
 * (la versión y el contador ya cambiaron por ella) y la persistencia devuelve el
 * resultado registrado.
 */
export class AmpliarRetorno
  implements IEjecutorComando<ComandoAmpliarRetorno, ResultadoAmpliarRetorno>
{
  constructor(
    private readonly dao: IExpedicionDAO,
    private readonly reloj: IReloj,
  ) {}

  async ejecutar(comando: ComandoAmpliarRetorno): Promise<ResultadoAmpliarRetorno> {
    const registrada = await this.dao.buscarOperacionRegistrada(
      comando.operacionId,
      comando.expedicionId,
      comando.senderistaId,
    );
    if (!registrada) await this.validarAntesDeEscribir(comando);

    try {
      return await this.dao.ampliarRetorno({
        expedicionId: comando.expedicionId,
        senderistaId: comando.senderistaId,
        versionEsperada: comando.versionEsperada,
        operacionId: comando.operacionId,
        minutos: comando.minutos,
        motivo: comando.motivo,
      });
    } catch (err) {
      if (err instanceof ErrorAmpliacionRetorno) throw traducir(err.codigo, err.versionActual);
      throw err;
    }
  }

  private async validarAntesDeEscribir(comando: ComandoAmpliarRetorno): Promise<void> {
    const plan = await this.dao.obtenerPlan(comando.expedicionId, comando.senderistaId);
    if (!plan) throw traducir('EXPEDICION_NO_ENCONTRADA');

    if (plan.estado === 'alerta') throw traducir('ALERTA_YA_DECLARADA');
    if (plan.estado !== ESTADO_AMPLIABLE) throw traducir('RETORNO_NO_AMPLIABLE');
    if (!plazoVigente(plan, this.reloj.ahora())) throw traducir('PLAZO_VENCIDO');
    if (plan.version !== comando.versionEsperada) {
      throw traducir('VERSION_OBSOLETA', plan.version);
    }

    const registradas = await this.dao.contarAmpliaciones(comando.expedicionId);
    if (ampliacionesRestantes(registradas) === 0) throw traducir('AMPLIACION_NO_DISPONIBLE');
  }
}
