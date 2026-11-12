import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../domain/errors/ErrorCoordinacion.js';
import type { IRelevoDAO } from '../../domain/repositories/IIncidenteDAO.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';
import type { ComandoProponerRelevo, ResultadoProponerRelevo } from '../commands/ComandoProponerRelevo.js';
import { traducirErrorRelevo } from './respuestasRelevo.js';

/**
 * Ejecutor del comando `ComandoProponerRelevo` (HU-40).
 *
 * Solo delega en `IRelevoDAO.proponerRelevo`: la persistencia resuelve en una transacción,
 * con el incidente bloqueado, las reglas, la idempotencia por `operacionId` y el único relevo
 * pendiente por incidente. Repetir esas reglas aquí no protegería nada frente a la
 * concurrencia. Aquí solo se traducen los rechazos de negocio a errores HTTP.
 */
export class ProponerRelevo implements IEjecutorComando<ComandoProponerRelevo, ResultadoProponerRelevo> {
  constructor(private readonly dao: IRelevoDAO) {}

  async ejecutar(comando: ComandoProponerRelevo): Promise<ResultadoProponerRelevo> {
    try {
      return await this.dao.proponerRelevo({
        expedicionId: comando.expedicionId,
        rescatistaId: comando.rescatistaId,
        destinatarioId: comando.destinatarioId,
        motivo: comando.motivo,
        versionIncidente: comando.versionIncidente,
        operacionId: comando.operacionId,
      });
    } catch (err) {
      if (err instanceof ErrorCoordinacion) throw traducirErrorRelevo(err as ErrorCoordinacion<CodigoErrorRelevo>);
      throw err;
    }
  }
}
