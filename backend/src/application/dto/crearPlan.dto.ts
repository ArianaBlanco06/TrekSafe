import { z } from 'zod';
import { camposExpedicionSchema, retornoPosteriorASalida, errorRetornoPosteriorASalida } from './usuario.dto.js';
import { parseDecimalCoordinates } from '../../shared/utils/coordinates.js';

export const sincronizarBorradorSchema = camposExpedicionSchema.extend({
  borradorId: z.string().uuid().transform(id => id.toLowerCase()),
  lugarInicio: z.string().trim().min(3).max(500),
  lugarFin: z.string().trim().min(3).max(500),
  horaInicio: z.string().datetime({ offset: true }),
  horaRetornoEstimada: z.string().datetime({ offset: true }),
  nombresAcompanantes: z.array(z.string().trim().min(2).max(200)).min(1).max(100),
  idsContactos: z.array(z.string().uuid().transform(id => id.toLowerCase())).min(1).max(100),
}).strict().refine(retornoPosteriorASalida, errorRetornoPosteriorASalida).transform(entrada => ({
  ...entrada,
  horaInicio: new Date(entrada.horaInicio).toISOString(),
  horaRetornoEstimada: new Date(entrada.horaRetornoEstimada).toISOString(),
  idsContactos: [...new Set(entrada.idsContactos)].sort(),
  coordenadasInicio: entrada.coordenadasInicio ? parseDecimalCoordinates(entrada.coordenadasInicio)!.formatted : undefined,
  coordenadasFin: entrada.coordenadasFin ? parseDecimalCoordinates(entrada.coordenadasFin)!.formatted : undefined,
}));
