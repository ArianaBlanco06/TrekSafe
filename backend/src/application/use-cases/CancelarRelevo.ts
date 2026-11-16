import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../domain/errors/ErrorCoordinacion.js';
import type { IRelevoDAO } from '../../domain/repositories/IIncidenteDAO.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';
import type { ComandoCancelarRelevo, ResultadoCancelarRelevo } from '../commands/ComandoCancelarRelevo.js';
import { traducirErrorRelevo } from './respuestasRelevo.js';

/**
 * Ejecutor del comando `ComandoCancelarRelevo` (HU-40).
 *
 * Solo delega en `IRelevoDAO.cancelarRelevo`: quien propuso resuelve el relevo pendiente sin cambiar al responsable ni la versión, con el incidente bloqueado.
 * Aquí solo se traducen los rechazos de negocio a errores HTTP.
 */
export class CancelarRelevo implements IEjecutorComando<ComandoCancelarRelevo, ResultadoCancelarRelevo> {
  constructor(private readonly dao: IRelevoDAO) {}

  async ejecutar(comando: ComandoCancelarRelevo): Promise<ResultadoCancelarRelevo> {
    try {
      return await this.dao.cancelarRelevo({
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
