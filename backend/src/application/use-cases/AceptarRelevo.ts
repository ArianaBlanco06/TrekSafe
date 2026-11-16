import { ErrorCoordinacion, type CodigoErrorRelevo } from '../../domain/errors/ErrorCoordinacion.js';
import type { IRelevoDAO } from '../../domain/repositories/IIncidenteDAO.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';
import type { ComandoAceptarRelevo, ResultadoAceptarRelevo } from '../commands/ComandoAceptarRelevo.js';
import { traducirErrorRelevo } from './respuestasRelevo.js';

/**
 * Ejecutor del comando `ComandoAceptarRelevo` (HU-40).
 *
 * Solo delega en `IRelevoDAO.aceptarRelevo`: la persistencia aplica el relevo en una
 * transacción (responsable, versión, estado del relevo y evento de transferencia) con el
 * incidente bloqueado. Aquí solo se traducen los rechazos de negocio a errores HTTP.
 */
export class AceptarRelevo implements IEjecutorComando<ComandoAceptarRelevo, ResultadoAceptarRelevo> {
  constructor(private readonly dao: IRelevoDAO) {}

  async ejecutar(comando: ComandoAceptarRelevo): Promise<ResultadoAceptarRelevo> {
    try {
      return await this.dao.aceptarRelevo({
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
