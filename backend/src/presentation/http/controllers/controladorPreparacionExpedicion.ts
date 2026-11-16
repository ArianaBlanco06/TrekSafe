import type { Request, Response } from 'express';
import type { ServicioPreparacionExpedicion } from '../../../application/services/servicioPreparacionExpedicion.js';
import {
  asociarListaExpedicionSchema, establecerPreparadoSchema, parametroItemPreparacionSchema,
  parametroPreparacionSchema, respuestaPreparacion,
} from '../dto/preparacionExpedicion.dto.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export class ControladorPreparacionExpedicion {
  constructor(private readonly servicio: ServicioPreparacionExpedicion) {}

  obtener = async (req: Request, res: Response): Promise<void> => {
    const { id } = parametroPreparacionSchema.parse(req.params);
    const preparacion = await this.servicio.obtenerPreparacion((req as SolicitudAutenticada).user.id, id);
    res.json({ preparacion: respuestaPreparacion(preparacion) });
  };

  asociar = async (req: Request, res: Response): Promise<void> => {
    const { id } = parametroPreparacionSchema.parse(req.params);
    const { listaId } = asociarListaExpedicionSchema.parse(req.body);
    const preparacion = await this.servicio.asociarLista((req as SolicitudAutenticada).user.id, id, listaId);
    res.status(201).json({ preparacion: respuestaPreparacion(preparacion) });
  };

  establecerPreparado = async (req: Request, res: Response): Promise<void> => {
    const { id, itemId } = parametroItemPreparacionSchema.parse(req.params);
    const { preparado } = establecerPreparadoSchema.parse(req.body);
    const preparacion = await this.servicio.establecerPreparado((req as SolicitudAutenticada).user.id, id, itemId, preparado);
    res.json({ preparacion: respuestaPreparacion(preparacion) });
  };
}
