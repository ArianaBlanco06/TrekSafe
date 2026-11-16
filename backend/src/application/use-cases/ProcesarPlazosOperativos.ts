import type { IRepositorioExpedicion } from '../ports/RepositorioExpedicion.js';
import type { IVencimientosOutbox } from '../ports/vencimientosOutbox.js';
import type { ResultadoProcesamientoRecordatorios } from '../services/servicioRecordatorioExpedicion.js';

export type DependenciasPlazosOperativos = {
  expediciones: Pick<IRepositorioExpedicion, 'promoverProgramadasListas'>;
  vencimientos: IVencimientosOutbox;
  recordatorios: {
    procesarRecordatorios(): Promise<ResultadoProcesamientoRecordatorios>;
  };
};

/** Produce pendientes duraderos; el transporte pertenece únicamente al consumidor. */
export async function procesarPlazosOperativos(
  dependencias: DependenciasPlazosOperativos,
  limite = 100,
) {
  const promovidas = await dependencias.expediciones.promoverProgramadasListas();
  const vencimientos = await dependencias.vencimientos.evaluar(limite);
  // No ocultar una falla de recordatorios como un ciclo correcto.
  const recordatorios = await dependencias.recordatorios.procesarRecordatorios();
  return {
    promovidas,
    ...vencimientos,
    recordatoriosGenerados: recordatorios.avisosGenerados,
  };
}
