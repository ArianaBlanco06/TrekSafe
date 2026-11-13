import type { BorradorExpedicion } from '@/application/ports/IColaLocal';
import type { Expedicion } from './expedicion';
import { api, ErrorClienteApi } from './clienteApi';
import { ErrorEnvioPlan } from '@/application/ports/ICreadorPlanRemoto';

export async function sincronizarBorrador(borrador: BorradorExpedicion) {
  try {
    return await api.post<{ expedicion: Expedicion; repetido: boolean }>('/expediciones/borradores/sincronizar', {
    borradorId: borrador.id, lugarInicio: borrador.lugarInicio, lugarFin: borrador.lugarFin,
    coordenadasInicio: borrador.coordenadasInicio || undefined, coordenadasFin: borrador.coordenadasFin || undefined,
    horaInicio: borrador.horaInicio, horaRetornoEstimada: borrador.horaRetornoEstimada,
    minutosTolerancia: borrador.minutosTolerancia, minutosRecordatorio: borrador.minutosRecordatorio ?? 30,
    idsContactos: borrador.idsContactos, nombresAcompanantes: borrador.nombresAcompanantes,
    }, true);
  } catch (error) {
    const confirmado = error instanceof ErrorClienteApi && error.status >= 400 && error.status < 500
      && ![401,408,429].includes(error.status) && error.codigo !== 'BORRADOR_REUTILIZADO';
    throw new ErrorEnvioPlan(error instanceof Error ? error.message : 'No se pudo confirmar el envío.', confirmado);
  }
}
