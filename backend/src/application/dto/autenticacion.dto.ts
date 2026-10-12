import { z } from 'zod';

const esquemaCorreo = z
  .string()
  .trim()
  .min(1, 'El correo es obligatorio')
  .email('Formato de correo inválido');

const esquemaContrasena = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número');

export const registrarSenderistaSchema = z.object({
  nombreCompleto: z.string().trim().min(3, 'Nombre completo obligatorio'),
  idDocumento: z
    .string()
    .trim()
    .regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos'),
  correoElectronico: esquemaCorreo,
  telefono: z
    .string()
    .trim()
    .min(9, 'Celular obligatorio')
    .regex(/^\+?\d{9,15}$/, 'Formato de celular inválido'),
  contrasena: esquemaContrasena,
  consentimientoPrivacidad: z.literal(true, {
    errorMap: () => ({
      message: 'Debe aceptar el tratamiento de datos personales (Ley N° 29733)',
    }),
  }),
});

export const iniciarSesionSchema = z.object({
  correoElectronico: esquemaCorreo,
  contrasena: z.string().min(1, 'La contraseña es obligatoria'),
});

export const registrarRescatistaSchema = z.object({
  nombreCompleto: z.string().trim().min(3, 'Nombre completo obligatorio'),
  correoElectronico: esquemaCorreo,
  contrasena: esquemaContrasena,
  institucion: z.enum(['AGMP', 'MINCETUR'], {
    errorMap: () => ({ message: 'Institución inválida' }),
  }),
  numeroCredencial: z.string().trim().min(5, 'Número de credencial obligatorio'),
  fechaNacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de nacimiento inválida (YYYY-MM-DD)'),
});

export type EntradaRegistrarSenderista = z.infer<typeof registrarSenderistaSchema>;
export type EntradaIniciarSesion = z.infer<typeof iniciarSesionSchema>;
export type EntradaRegistrarRescatista = z.infer<typeof registrarRescatistaSchema>;
