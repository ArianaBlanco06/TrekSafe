import type { Request, Response } from 'express';
import {
  iniciarSesionSchema,
  registrarRescatistaSchema,
  registrarSenderistaSchema,
} from '../../../application/dto/autenticacion.dto.js';
import { ServicioAutenticacion } from '../../../application/services/servicioAutenticacion.js';

export function crearControladorAutenticacion(
  servicioAuth: ServicioAutenticacion,
) {
  async function registrarSenderista(
    req: Request,
    res: Response,
  ): Promise<void> {
    const entrada = registrarSenderistaSchema.parse(req.body);
    const resultado = await servicioAuth.registrarSenderista(entrada);
    res.status(201).json({
      mensaje: 'Cuenta de senderista creada correctamente',
      ...resultado,
    });
  }

  async function iniciarSesion(req: Request, res: Response): Promise<void> {
    const entrada = iniciarSesionSchema.parse(req.body);
    const resultado = await servicioAuth.iniciarSesion(entrada);
    res.status(200).json({
      mensaje: 'Inicio de sesión exitoso',
      ...resultado,
    });
  }

  async function registrarRescatista(
    req: Request,
    res: Response,
  ): Promise<void> {
    const entrada = registrarRescatistaSchema.parse(req.body);
    const resultado = await servicioAuth.registrarRescatista(entrada);
    res.status(201).json({
      mensaje:
        'Credenciales validadas. Cuenta de rescatista creada correctamente',
      ...resultado,
    });
  }

  return { registrarSenderista, iniciarSesion, registrarRescatista };
}
