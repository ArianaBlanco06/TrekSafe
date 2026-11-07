import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ServicioPuntosRuta } from '../../../application/services/servicioPuntosRuta.js';
import type { DetallesPuntos, RechazoGuardadoPuntos } from '../../../application/ports/puntosRuta.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const rechazos: Record<RechazoGuardadoPuntos['tipo'], { estado: number; codigo: string; mensaje: string }> = {
  no_encontrado: { estado: 404, codigo: 'NO_ENCONTRADO', mensaje: 'Expedición no encontrada' },
  expedicion_no_editable: {
    estado: 409, codigo: 'EXPEDICION_NO_EDITABLE', mensaje: 'Solo puedes editar puntos de una expedición programada',
  },
  expedicion_ya_iniciada: {
    estado: 409, codigo: 'EXPEDICION_YA_INICIADA', mensaje: 'La hora de salida ya fue alcanzada',
  },
  version_obsoleta: {
    estado: 409, codigo: 'VERSION_PLAN_OBSOLETA',
    mensaje: 'La expedición cambió. Vuelve a consultarla antes de guardar',
  },
  datos_invalidos: { estado: 400, codigo: 'DATOS_PUNTOS_INVALIDOS', mensaje: 'Datos de puntos inválidos' },
};

function responderRechazo(res: Response, rechazo: RechazoGuardadoPuntos): void {
  const error = rechazos[rechazo.tipo];
  res.status(error.estado).json({
    error: rechazo.tipo === 'datos_invalidos' ? 'ErrorValidacion' : 'ErrorAplicacion',
    mensaje: error.mensaje, codigo: error.codigo,
    ...(rechazo.tipo === 'datos_invalidos' ? { detalles: rechazo.detalles } : {}),
  });
}

function detallesValidacion(error: ZodError): DetallesPuntos {
  const detalles: DetallesPuntos = Object.create(null);
  for (const issue of error.issues) {
    const rutas = issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...issue.path, key]) : [issue.path];
    for (const ruta of rutas) {
      const clave = ruta.join('.') || '_cuerpo';
      (detalles[clave] ??= []).push(issue.message);
    }
  }
  return detalles;
}

export function crearControladorPuntosRuta(servicio: ServicioPuntosRuta) {
  return {
    consultar: async (req: Request, res: Response): Promise<void> => {
      try {
        const ruta = await servicio.consultar((req as SolicitudAutenticada).user.id, req.params.id);
        if (ruta === null) return responderRechazo(res, { tipo: 'no_encontrado' });
        res.set('Cache-Control', 'no-store').status(200).json(ruta);
      } catch (error) {
        if (!(error instanceof ZodError)) throw error;
        responderRechazo(res, { tipo: 'datos_invalidos', detalles: detallesValidacion(error) });
      }
    },
    guardar: async (req: Request, res: Response): Promise<void> => {
      try {
        const resultado = await servicio.guardar((req as SolicitudAutenticada).user.id, req.params.id, req.body);
        if (resultado.tipo !== 'guardado') return responderRechazo(res, resultado);
        res.set('Cache-Control', 'no-store').status(200).json({
          mensaje: 'Puntos de ruta guardados', ...resultado.ruta,
        });
      } catch (error) {
        if (!(error instanceof ZodError)) throw error;
        responderRechazo(res, {
          tipo: 'datos_invalidos', detalles: detallesValidacion(error),
        });
      }
    },
  };
}
