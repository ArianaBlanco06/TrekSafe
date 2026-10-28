import { z } from 'zod';
import { campoCoordenadaOpcional } from './usuario.dto.js';

const sinRepetidos = (ids: string[]) =>
  new Set(ids.map((id) => id.toLowerCase())).size === ids.length;

export const guardarPlantillaSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre obligatorio').max(80),
  lugarInicio: z.string().trim().min(3, 'Ubicación inicial obligatoria').max(500),
  lugarFin: z.string().trim().min(3, 'Destino obligatorio').max(500),
  coordenadasInicio: campoCoordenadaOpcional('salida'),
  coordenadasFin: campoCoordenadaOpcional('destino'),
  minutosTolerancia: z.coerce.number().int().min(1).max(480).default(30),
  idsContactos: z
    .array(z.string().uuid())
    .max(10)
    .refine(sinRepetidos, { message: 'Contactos repetidos' })
    .default([]),
  nombresAcompanantes: z.array(z.string().trim().min(2).max(200)).max(20).default([]),
});

export const renombrarPlantillaSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre obligatorio').max(80),
  versionEsperada: z.coerce.number().int().min(1),
});

export type EntradaGuardarPlantilla = z.infer<typeof guardarPlantillaSchema>;
export type EntradaRenombrarPlantilla = z.infer<typeof renombrarPlantillaSchema>;

export type PlantillaDTO = {
  id: string;
  nombre: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
  version: number;
  creadoEn: string;
  actualizadoEn: string;
};
