import type { Request, Response } from 'express';
import type { ServicioListasEquipo } from '../../../application/services/servicioListasEquipo.js';
import {
  crearListaEquipoSchema, actualizarListaEquipoSchema, parametroListaEquipoSchema,
} from '../dto/listasEquipo.dto.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export class ControladorListasEquipo {
  constructor(private readonly servicio: ServicioListasEquipo) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    const listas = await this.servicio.listarListas((req as SolicitudAutenticada).user.id);
    res.json({ listas });
  };

  obtener = async (req: Request, res: Response): Promise<void> => {
    const { listaId } = parametroListaEquipoSchema.parse(req.params);
    const lista = await this.servicio.obtenerLista((req as SolicitudAutenticada).user.id, listaId);
    res.json({ lista });
  };

  crear = async (req: Request, res: Response): Promise<void> => {
    const entrada = crearListaEquipoSchema.parse(req.body);
    const lista = await this.servicio.crearLista((req as SolicitudAutenticada).user.id, entrada);
    res.status(201).json({ mensaje: 'Lista de equipo creada.', lista });
  };

  actualizar = async (req: Request, res: Response): Promise<void> => {
    const { listaId } = parametroListaEquipoSchema.parse(req.params);
    const entrada = actualizarListaEquipoSchema.parse(req.body);
    const lista = await this.servicio.actualizarLista((req as SolicitudAutenticada).user.id, listaId, entrada);
    res.json({ mensaje: 'Lista de equipo actualizada.', lista });
  };

  eliminar = async (req: Request, res: Response): Promise<void> => {
    const { listaId } = parametroListaEquipoSchema.parse(req.params);
    await this.servicio.eliminarLista((req as SolicitudAutenticada).user.id, listaId);
    res.status(204).send();
  };
}
