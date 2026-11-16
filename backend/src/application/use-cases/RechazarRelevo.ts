import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../domain/errors/ErrorCoordinacion.js';
import type { IRelevoDAO } from '../../domain/repositories/IIncidenteDAO.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';
import type { ComandoRechazarRelevo, ResultadoRechazarRelevo } from '../commands/ComandoRechazarRelevo.js';
import { traducirErrorRelevo } from './respuestasRelevo.js';

/**
 * Ejecutor del comando `ComandoRechazarRelevo` (HU-40).
 *
 * Solo delega en `IRelevoDAO.rechazarRelevo`: el destinatario resuelve el relevo pendiente sin cambiar al responsable ni la versión, con el incidente bloqueado.
 * Aquí solo se traducen los rechazos de negocio a errores HTTP.
 */
export class RechazarRelevo implements IEjecutorComando<ComandoRechazarRelevo, ResultadoRechazarRelevo> {
  constructor(private readonly dao: IRelevoDAO) {}

  async ejecutar(comando: ComandoRechazarRelevo): Promise<ResultadoRechazarRelevo> {
    try {
      return await this.dao.rechazarRelevo({
        expedicionId: comando.expedicionId,
        rescatistaId: comando.rescatistaId,
        relevoId: comando.relevoId,
        operacionId: comando.operacionId,
      });
    } catch (err) {
      if (err instanceof ErrorCoordinacion) throw traducirErrorRelevo(err as ErrorCoordinacion<CodigoErrorRelevo>);
      throw err;
    }
  }
}
