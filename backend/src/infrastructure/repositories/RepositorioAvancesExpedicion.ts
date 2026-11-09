import { z } from 'zod';
import type { IConsultaAvances, IRegistroAvances, OrdenRegistrarAvance, ResultadoConsultaAvance, ResultadoRegistroAvance } from '../../application/ports/avancesExpedicion.js';

interface ClienteRpcAvances {
  rpc(nombre: string, parametros: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
const avanceSchema = z.object({
  id: z.string().uuid(), solicitudId: z.string().uuid(), expedicionId: z.string().uuid(),
  punto: z.object({ id: z.string().uuid(), nombre: z.string(), orden: z.number().int().min(1).max(20) }).strict(),
  registradoEn: z.string().datetime(), nota: z.string().nullable(),
}).strict();
const registroSchema = z.union([
  z.object({ tipo: z.enum(['registrado','repetido']), avance: avanceSchema }).strict(),
  z.object({ tipo: z.enum(['no_encontrado','estado_no_admitido','punto_no_disponible','solicitud_reutilizada','datos_invalidos']) }).strict(),
]);
const consultaSchema = z.object({ tipo: z.literal('consultado'), ultimoAvance: avanceSchema.nullable() }).strict();

export class RepositorioAvancesExpedicion implements IRegistroAvances, IConsultaAvances {
  constructor(private readonly cliente: ClienteRpcAvances) {}
  private async ejecutar(nombre: string, parametros: Record<string, unknown>) {
    for (let intento = 0; intento < 3; intento++) {
      const { data, error } = await this.cliente.rpc(nombre, parametros);
      if (!error) return data;
      if (intento < 2 && ['40001','40P01'].includes(error.code ?? '')) continue;
      throw new Error('No se pudo ejecutar la operación de avances.');
    }
    throw new Error('No se pudo completar la operación de avances.');
  }
  async registrarPropio(orden: OrdenRegistrarAvance): Promise<ResultadoRegistroAvance> {
    const data = await this.ejecutar('treksafe_registrar_avance', {
      p_senderista_id: orden.senderistaId, p_expedicion_id: orden.expedicionId,
      p_solicitud_id: orden.solicitudId, p_punto_id: orden.puntoId, p_nota: orden.nota,
    });
    const resultado = registroSchema.safeParse(data);
    if (!resultado.success) throw new Error('Respuesta inválida del registro de avances.');
    return resultado.data;
  }
  async consultarUltimoPropio(senderistaId: string, expedicionId: string): Promise<ResultadoConsultaAvance> {
    const data = await this.ejecutar('treksafe_consultar_ultimo_avance', {
      p_senderista_id: senderistaId, p_expedicion_id: expedicionId,
    });
    if (data === null) return { tipo: 'no_encontrado' };
    const resultado = consultaSchema.safeParse(data);
    if (!resultado.success) throw new Error('Respuesta inválida de consulta de avances.');
    return resultado.data;
  }
}
