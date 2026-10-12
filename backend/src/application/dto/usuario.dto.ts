import { z } from 'zod';
import { parseDecimalCoordinates, isValidPeruCoordinates } from '../../shared/utils/coordinates.js';

const tiposSangre = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

function campoCoordenadaOpcional(campo: string) {
  return z
    .string()
    .trim()
    .optional()
    .refine(
      (valor) => {
        if (!valor) return true;
        const analizado = parseDecimalCoordinates(valor);
        return analizado !== null && isValidPeruCoordinates(analizado.lat, analizado.lon);
      },
      {
        message: `Coordenadas de ${campo} inválidas. Formato: -9.0105, -77.6042`,
      },
    );
}

export const actualizarFichaMedicaSchema = z.object({
  tipoSangre: z.enum(tiposSangre),
  alergias: z.string().trim().max(1000).default(''),
  condiciones: z.string().trim().max(2000).default(''),
  medicamentos: z.string().trim().max(1000).default(''),
  consentimientoFirmado: z.literal(true, {
    errorMap: () => ({
      message: 'Debe autorizar la revelación de datos únicamente en alerta activa',
    }),
  }),
});

export const crearContactoSchema = z.object({
  nombreCompleto: z.string().trim().min(2, 'Nombre obligatorio'),
  parentesco: z.string().trim().min(2, 'Parentesco obligatorio'),
  telefono: z
    .string()
    .trim()
    .regex(/^\+?\d{9,15}$/, 'Teléfono inválido'),
  correoElectronico: z.string().trim().email('Correo inválido'),
});

export const crearExpedicionSchema = z
  .object({
    lugarInicio: z.string().trim().min(3, 'Ubicación inicial obligatoria'),
    lugarFin: z.string().trim().min(3, 'Destino obligatorio'),
    coordenadasInicio: campoCoordenadaOpcional('salida'),
    coordenadasFin: campoCoordenadaOpcional('destino'),
    horaInicio: z.string().min(1, 'Hora de salida obligatoria'),
    horaRetornoEstimada: z.string().min(1, 'Hora de retorno obligatoria'),
    minutosTolerancia: z.coerce.number().int().min(1).max(480).default(30),
    idsContactos: z.array(z.string().uuid()).min(1, 'Selecciona al menos un contacto'),
    nombresAcompanantes: z
      .array(z.string().trim().min(2))
      .min(1, 'Agrega al menos un acompañante'),
  })
  .refine((d) => new Date(d.horaRetornoEstimada) > new Date(d.horaInicio), {
    message: 'La hora de retorno debe ser posterior a la hora de salida',
    path: ['horaRetornoEstimada'],
  });

export type EntradaActualizarFichaMedica = z.infer<typeof actualizarFichaMedicaSchema>;
export type EntradaCrearContacto = z.infer<typeof crearContactoSchema>;
export type EntradaCrearExpedicion = z.infer<typeof crearExpedicionSchema>;
