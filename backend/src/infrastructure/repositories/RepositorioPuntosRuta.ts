import { z } from 'zod';
import type {
  IConsultaPuntosRuta, IGuardadoPuntosRuta, OrdenGuardarPuntos, ResultadoGuardadoPuntos,
} from '../../application/ports/puntosRuta.js';
import { coleccionPuntosSchema, versionPuntosSchema } from '../../application/dto/puntosRuta.dto.js';
import type { RutaConPuntos } from '../../domain/entities/RutaConPuntos.js';

/** Puerto minimo del cliente externo, util tambien para pruebas del adaptador. */
export interface ClienteRpcPuntos {
  rpc(nombre: string, parametros: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown | null;
  }>;
}

const rutaSchema = z.object({
  expedicion: z.object({
    id: z.string().uuid(),
    estado: z.enum(['programada', 'en_progreso', 'completada', 'alerta', 'cancelada']),
    lugarInicio: z.string(), lugarFin: z.string(),
    coordenadasInicio: z.string().nullable(), coordenadasFin: z.string().nullable(),
    horaInicio: z.string().datetime({ offset: true }).transform((hora) => new Date(hora).toISOString()),
    version: versionPuntosSchema, editable: z.boolean(),
  }).strict(),
  puntos: coleccionPuntosSchema,
}).strict();

const resultadoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('guardado'), ruta: rutaSchema }).strict(),
  z.object({ tipo: z.literal('datos_invalidos'), detalles: z.record(z.array(z.string())) }).strict(),
  z.object({ tipo: z.literal('no_encontrado') }).strict(),
  z.object({ tipo: z.literal('expedicion_no_editable') }).strict(),
  z.object({ tipo: z.literal('expedicion_ya_iniciada') }).strict(),
  z.object({ tipo: z.literal('version_obsoleta') }).strict(),
]);

export class RepositorioPuntosRuta implements IConsultaPuntosRuta, IGuardadoPuntosRuta {
  constructor(private readonly cliente: ClienteRpcPuntos) {}

  private async ejecutar(nombre: string, parametros: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.cliente.rpc(nombre, parametros);
    if (error) throw new Error(`No se pudo ejecutar ${nombre}`);
    return data;
  }

  async consultarPropia(senderistaId: string, expedicionId: string): Promise<RutaConPuntos | null> {
    const data = await this.ejecutar('treksafe_consultar_puntos_ruta', {
      p_senderista_id: senderistaId, p_expedicion_id: expedicionId,
    });
    if (data === null) return null;
    const resultado = rutaSchema.safeParse(data);
    if (!resultado.success) throw new Error('Respuesta inválida de consulta de puntos');
    return resultado.data;
  }

  async guardarColeccionPropia(orden: OrdenGuardarPuntos): Promise<ResultadoGuardadoPuntos> {
    const data = await this.ejecutar('treksafe_guardar_puntos_ruta', {
      p_senderista_id: orden.senderistaId, p_expedicion_id: orden.expedicionId,
      p_version_esperada: orden.versionEsperada, p_puntos: orden.puntos,
    });
    const resultado = resultadoSchema.safeParse(data);
    if (!resultado.success) throw new Error('Respuesta inválida de guardado de puntos');
    return resultado.data;
  }
}
