import { z } from 'zod';
import type { ICreadorPlanIdempotente, OrdenCrearPlan, PlanCreado } from '../../application/ports/creacionPlan.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

export class CreadorPlanSupabase implements ICreadorPlanIdempotente {
  constructor(private readonly cliente: { rpc(nombre: string, parametros: Record<string, unknown>): PromiseLike<{data: unknown; error: unknown}> }) {}
  async crear(orden: OrdenCrearPlan) {
    const { data, error } = await this.cliente.rpc('treksafe_crear_plan_borrador', {
      p_senderista_id: orden.senderistaId, p_borrador_id: orden.borradorId, p_datos: orden.datos,
    });
    if (error) throw new ErrorAplicacion(503, 'No se pudo confirmar la creación. Reintenta el mismo borrador.', 'CREACION_NO_CONFIRMADA');
    const planSchema = z.object({ id:z.string().uuid(),lugarInicio:z.string(),lugarFin:z.string(),
      horaInicio:z.string().datetime({offset:true}),horaRetornoEstimada:z.string().datetime({offset:true}),
      minutosTolerancia:z.number().int(),estado:z.string(),version:z.number().int(),creadoEn:z.string().datetime({offset:true}) });
    const resultado = data as { tipo: string; expedicion?: PlanCreado };
    if (resultado?.expedicion && ['creado', 'repetido'].includes(resultado.tipo)) {
      const plan = planSchema.safeParse(resultado.expedicion);
      if (!plan.success) throw new ErrorAplicacion(503, 'No se pudo confirmar la creación. Reintenta el mismo borrador.', 'CREACION_NO_CONFIRMADA');
      return { expedicion: plan.data, repetido: resultado.tipo === 'repetido' };
    }
    const errores: Record<string, [number, string, string]> = {
      fechas_invalidas: [400, 'Corrige las fechas: la salida debe ser futura y el retorno posterior.', 'FECHAS_INVALIDAS'],
      contactos_invalidos: [400, 'Revisa los contactos de alerta vigentes de tu cuenta.', 'CONTACTOS_INVALIDOS'],
      solicitud_reutilizada: [409, 'Este identificador ya fue enviado con otros datos.', 'BORRADOR_REUTILIZADO'],
      plan_eliminado: [410, 'El borrador ya se sincronizó y su plan fue eliminado.', 'PLAN_ELIMINADO'],
      expedicion_activa: [409, 'Ya tienes una expedición en curso o en alerta.', 'EXPEDICION_ACTIVA_EXISTE'],
      no_autorizado: [403, 'Solo un senderista puede crear planes.', 'ROL_NO_PERMITIDO'],
      datos_invalidos: [400, 'Los datos del borrador no son válidos.', 'BORRADOR_INVALIDO'],
    };
    const [estado, mensaje, codigo] = errores[resultado?.tipo] ?? [503, 'No se pudo confirmar la creación. Reintenta el mismo borrador.', 'CREACION_NO_CONFIRMADA'];
    throw new ErrorAplicacion(estado, mensaje, codigo);
  }
}
