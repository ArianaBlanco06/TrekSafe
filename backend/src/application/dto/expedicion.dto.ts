import { z } from 'zod';

export const confirmarRetornoSchema = z.object({
  contrasena: z.string().min(1, 'Contraseña requerida'),
});

export type EntradaConfirmarRetorno = z.infer<typeof confirmarRetornoSchema>;
