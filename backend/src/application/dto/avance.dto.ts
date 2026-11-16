import { z } from 'zod';

export function normalizarNotaAvance(nota: string | null | undefined): string | null {
  return nota?.replace(/\r\n?/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '') || null;
}
const uuidV4 = z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  .transform(valor => valor.toLowerCase());
const nota = z.string().nullable().optional().transform(normalizarNotaAvance).superRefine((valor, ctx) => {
  if (valor === null) return;
  if (Array.from(valor).length > 500) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La nota no puede superar 500 caracteres Unicode.' });
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(valor)
    || Array.from(valor).some(c => /^[\uD800-\uDFFF]$/.test(c))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La nota contiene caracteres no válidos.' });
  }
});
export const registrarAvanceSchema = z.object({ solicitudId: uuidV4, puntoId: uuidV4, nota }).strict();
