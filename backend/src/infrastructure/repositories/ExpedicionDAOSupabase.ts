import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorCancelacionPlan,
  type CodigoErrorCancelacionPlan,
} from '../../domain/errors/ErrorCancelacionPlan.js';
import {
  ErrorEdicionPlan,
  type CodigoErrorEdicionPlan,
} from '../../domain/errors/ErrorEdicionPlan.js';
import type {
  ComandoEditarPlan,
  IExpedicionDAO,
  PlanExpedicion,
  ResultadoCancelacionPlan,
  ResultadoEdicionPlan,
  SolicitudCancelacionPlan,
} from '../../domain/repositories/IExpedicionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

const CODIGOS_RPC = new Set<string>([
  'EXPEDICION_NO_ENCONTRADA',
  'PLAN_NO_EDITABLE',
  'SALIDA_YA_INICIADA',
  'VERSION_OBSOLETA',
  'SALIDA_EN_PASADO',
  'RETORNO_INVALIDO',
  'TOLERANCIA_INVALIDA',
  'CONTACTOS_INVALIDOS',
  'DATOS_INVALIDOS',
]);

const CODIGOS_RPC_CANCELAR = new Set<string>([
  'EXPEDICION_NO_ENCONTRADA',
  'PLAN_NO_CANCELABLE',
  'DATOS_INVALIDOS',
]);

type FilaPlan = {
  id: string;
  senderista_id: string;
  lugar_inicio: string;
  lugar_fin: string;
  coordenadas_inicio: string | null;
  coordenadas_fin: string | null;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  estado: string;
  version: number;
  creado_en: string;
  actualizado_en: string;
  acompanantes_expedicion: { nombre_acompanante: string }[];
  vinculos_expedicion_contacto: { contacto_id: string }[];
};

function errorInterno(contexto: string, causa: { message: string }): ErrorAplicacion {
  console.error(`[ExpedicionDAOSupabase] ${contexto}:`, causa.message);
  return new ErrorAplicacion(500, 'No se pudo completar la operación sobre la expedición');
}

export class ExpedicionDAOSupabase implements IExpedicionDAO {
  constructor(private readonly cliente: Pick<SupabaseClient, 'from' | 'rpc'>) {}

  async obtenerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion | null> {
    const { data, error } = await this.cliente
      .from('expediciones')
      .select(
        `
        id, senderista_id, lugar_inicio, lugar_fin, coordenadas_inicio, coordenadas_fin,
        hora_inicio, hora_retorno_estimada, minutos_tolerancia, estado, version,
        creado_en, actualizado_en,
        acompanantes_expedicion ( nombre_acompanante ),
        vinculos_expedicion_contacto ( contacto_id )
      `,
      )
      .eq('id', expedicionId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw errorInterno('obtenerPlan', error);
    if (!data) return null;

    const fila = data as unknown as FilaPlan;
    return {
      id: fila.id,
      senderistaId: fila.senderista_id,
      lugarInicio: fila.lugar_inicio,
      lugarFin: fila.lugar_fin,
      coordenadasInicio: fila.coordenadas_inicio,
      coordenadasFin: fila.coordenadas_fin,
      horaInicio: fila.hora_inicio,
      horaRetornoEstimada: fila.hora_retorno_estimada,
      minutosTolerancia: fila.minutos_tolerancia,
      estado: fila.estado,
      version: fila.version,
      creadoEn: fila.creado_en,
      actualizadoEn: fila.actualizado_en,
      idsContactos: fila.vinculos_expedicion_contacto.map((v) => v.contacto_id),
      nombresAcompanantes: fila.acompanantes_expedicion.map((a) => a.nombre_acompanante),
    };
  }

  async buscarOperacionRegistrada(
    operacionId: string,
    expedicionId: string,
    senderistaId: string,
  ): Promise<ResultadoEdicionPlan | null> {
    const { data, error } = await this.cliente
      .from('eventos_plan')
      .select('expedicion_id, version_resultante')
      .eq('operacion_id', operacionId)
      .eq('expedicion_id', expedicionId)
      .eq('senderista_id', senderistaId)
      .maybeSingle();

    if (error) throw errorInterno('buscarOperacionRegistrada', error);
    if (!data) return null;

    const fila = data as { expedicion_id: string; version_resultante: number };
    return { id: fila.expedicion_id, version: fila.version_resultante };
  }

  async editarPlan(comando: ComandoEditarPlan): Promise<ResultadoEdicionPlan> {
    const { data, error } = await this.cliente.rpc('treksafe_editar_expedicion', {
      p_expedicion_id: comando.expedicionId,
      p_senderista_id: comando.senderistaId,
      p_version_esperada: comando.versionEsperada,
      p_datos: comando.datos,
      p_operacion_id: comando.operacionId,
    });

    if (error) {
      if (CODIGOS_RPC.has(error.message)) {
        const versionActual =
          error.message === 'VERSION_OBSOLETA' ? Number(error.details) : undefined;
        throw new ErrorEdicionPlan(
          error.message as CodigoErrorEdicionPlan,
          Number.isInteger(versionActual) ? versionActual : undefined,
        );
      }
      throw errorInterno('editarPlan', error);
    }

    return data as ResultadoEdicionPlan;
  }

  async cancelarPlan(solicitud: SolicitudCancelacionPlan): Promise<ResultadoCancelacionPlan> {
    const { data, error } = await this.cliente.rpc('treksafe_cancelar_expedicion', {
      p_expedicion_id: solicitud.expedicionId,
      p_senderista_id: solicitud.senderistaId,
      p_motivo: solicitud.motivo,
      p_operacion_id: solicitud.operacionId,
    });

    if (error) {
      if (CODIGOS_RPC_CANCELAR.has(error.message)) {
        throw new ErrorCancelacionPlan(error.message as CodigoErrorCancelacionPlan);
      }
      throw errorInterno('cancelarPlan', error);
    }

    return data as ResultadoCancelacionPlan;
  }
}
