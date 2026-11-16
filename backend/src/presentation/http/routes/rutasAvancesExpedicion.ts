import { Router } from 'express';
import { z } from 'zod';
import { registrarAvanceSchema } from '../../../application/dto/avance.dto.js';
import type { IConsultaAvances, OrdenRegistrarAvance } from '../../../application/ports/avancesExpedicion.js';
import type { RegistrarAvance } from '../../../application/use-cases/RegistrarAvance.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { middlewareAutenticacion, requerirRol, type SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const idSchema = z.string().uuid();
function validar<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T {
  const resultado = schema.safeParse(valor);
  if (!resultado.success) throw new ErrorAplicacion(400, 'Datos de avance inválidos', 'DATOS_AVANCE_INVALIDOS', {
    detalles: { ...resultado.error.flatten().fieldErrors, _formulario: resultado.error.flatten().formErrors },
  });
  return resultado.data;
}
export function crearRutasAvancesExpedicion(
  crearComando: (orden: OrdenRegistrarAvance) => RegistrarAvance, consulta: IConsultaAvances,
): Router {
  const router = Router();
  const autorizacion = [middlewareAutenticacion, requerirRol('senderista')];
  router.post('/:id/avances', ...autorizacion, asyncHandler(async (req, res) => {
    const expedicionId = validar(idSchema, req.params.id);
    const entrada = validar(registrarAvanceSchema, req.body);
    const resultado = await crearComando({ senderistaId: (req as SolicitudAutenticada).user.id, expedicionId, ...entrada }).ejecutar();
    if ('avance' in resultado) {
      res.status(resultado.tipo === 'registrado' ? 201 : 200).set('Cache-Control','no-store')
        .json({ avance: resultado.avance, repetida: resultado.tipo === 'repetido' });
      return;
    }
    const rechazos = {
      no_encontrado: [404,'Expedición no encontrada.','EXPEDICION_NO_ENCONTRADA'],
      estado_no_admitido: [409,'La expedición no está en progreso.','EXPEDICION_NO_EN_PROGRESO'],
      punto_no_disponible: [409,'El punto no está disponible en esta expedición.','PUNTO_NO_DISPONIBLE'],
      solicitud_reutilizada: [409,'La solicitud ya se utilizó con otros datos.','SOLICITUD_REUTILIZADA'],
      datos_invalidos: [400,'Datos de avance inválidos.','DATOS_AVANCE_INVALIDOS'],
    } as const;
    const [estado, mensaje, codigo] = rechazos[resultado.tipo];
    throw new ErrorAplicacion(estado, mensaje, codigo);
  }));
  router.get('/:id/avances/ultimo', ...autorizacion, asyncHandler(async (req, res) => {
    const expedicionId = validar(idSchema, req.params.id);
    const resultado = await consulta.consultarUltimoPropio((req as SolicitudAutenticada).user.id, expedicionId);
    if (resultado.tipo === 'no_encontrado') throw new ErrorAplicacion(404,'Expedición no encontrada.','EXPEDICION_NO_ENCONTRADA');
    res.set('Cache-Control','no-store').json({ ultimoAvance: resultado.ultimoAvance });
  }));
  return router;
}
