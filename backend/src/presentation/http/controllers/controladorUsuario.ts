import type { Request, Response } from 'express';
import { revocacionDatosSchema } from '../../../application/dto/privacidad.dto.js';
import { crearContactoSchema, actualizarFichaMedicaSchema } from '../../../application/dto/usuario.dto.js';
import { ServicioUsuario } from '../../../application/services/servicioUsuario.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

const servicioUsuario = new ServicioUsuario();

function solicitudAuth(req: Request): SolicitudAutenticada {
  return req as SolicitudAutenticada;
}

export async function actualizarFichaMedica(req: Request, res: Response): Promise<void> {
  const entrada = actualizarFichaMedicaSchema.parse(req.body);
  const datos = await servicioUsuario.actualizarFichaMedica(solicitudAuth(req).user.id, entrada);
  res.status(200).json({ mensaje: 'Ficha médica guardada', fichaMedica: datos });
}

export async function obtenerFichaMedica(req: Request, res: Response): Promise<void> {
  const datos = await servicioUsuario.obtenerFichaMedica(solicitudAuth(req).user.id);
  res.status(200).json({ fichaMedica: datos });
}

export async function obtenerContactos(req: Request, res: Response): Promise<void> {
  const contactos = await servicioUsuario.listarContactos(solicitudAuth(req).user.id);
  res.status(200).json({ contactos });
}

export async function crearContacto(req: Request, res: Response): Promise<void> {
  const entrada = crearContactoSchema.parse(req.body);
  const contacto = await servicioUsuario.crearContacto(solicitudAuth(req).user.id, entrada);
  res.status(201).json({ mensaje: 'Contacto creado', contacto });
}

export async function eliminarContacto(req: Request, res: Response): Promise<void> {
  const contactoId = String(req.params.contactoId);
  await servicioUsuario.eliminarContacto(solicitudAuth(req).user.id, contactoId);
  res.status(200).json({ mensaje: 'Contacto eliminado' });
}

export async function revocarDatos(req: Request, res: Response): Promise<void> {
  const entrada = revocacionDatosSchema.parse(req.body);
  const resultado = await servicioUsuario.revocarDatosPersonales(solicitudAuth(req).user.id, entrada);
  res.status(200).json(resultado);
}
