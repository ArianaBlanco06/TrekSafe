import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  guardarPlantillaSchema,
  renombrarPlantillaSchema,
} from '../../../application/dto/plantilla.dto.js';
import type { ModuloPlantillas } from '../../../application/modulos/ModuloPlantillas.js';
import { ErrorAplicacion } from '../../../shared/errors/ErrorAplicacion.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const esquemaUuid = z.string().uuid();

function usuarioId(req: Request): string {
  return (req as SolicitudAutenticada).user.id;
}

/** Un id que no es UUID se trata como plantilla inexistente (evita el error 22P02 de PostgreSQL). */
function idPlantilla(req: Request): string {
  const id = esquemaUuid.safeParse(req.params.id);
  if (!id.success) {
    throw new ErrorAplicacion(404, 'Plantilla no encontrada', 'PLANTILLA_NO_ENCONTRADA');
  }
  return id.data;
}

export function crearControladorPlantillas(modulo: ModuloPlantillas) {
  return {
    async listar(req: Request, res: Response): Promise<void> {
      const plantillas = await modulo.servicio.listar(usuarioId(req));
      res.status(200).json({ plantillas });
    },

    async guardar(req: Request, res: Response): Promise<void> {
      const entrada = guardarPlantillaSchema.parse(req.body);
      const plantilla = await modulo.servicio.guardar(usuarioId(req), entrada);
      res.status(201).json({ mensaje: 'Plantilla guardada', plantilla });
    },

    async renombrar(req: Request, res: Response): Promise<void> {
      const id = idPlantilla(req);
      const entrada = renombrarPlantillaSchema.parse(req.body);
      const plantilla = await modulo.servicio.renombrar(usuarioId(req), id, entrada);
      res.status(200).json({ mensaje: 'Plantilla renombrada', plantilla });
    },

    async eliminar(req: Request, res: Response): Promise<void> {
      await modulo.servicio.eliminar(usuarioId(req), idPlantilla(req));
      res.status(204).send();
    },

    async obtenerBorrador(req: Request, res: Response): Promise<void> {
      const borrador = await modulo.creadorDesdePlantilla.prepararBorrador(
        usuarioId(req),
        idPlantilla(req),
      );
      res.status(200).json({ borrador });
    },
  };
}
