import { ErrorCierreIncidente } from '../../domain/errors/ErrorCierreIncidente.js';
import type { IRegistroLocalizacionIncidente } from '../../domain/repositories/ICierreIncidenteDAO.js';
import type { ComandoMarcarIncidenteLocalizado, ResultadoMarcarLocalizado } from '../commands/ComandoMarcarIncidenteLocalizado.js';
import type { IEjecutorComando } from '../commands/IEjecutorComando.js';
import { traducirErrorCierre } from './CerrarIncidente.js';

/**
 * Ejecutor del comando `ComandoMarcarIncidenteLocalizado` (HU-42, D2): abierto → localizado.
 * Delega en la persistencia, que autoriza con la fila bloqueada; aquí solo se traducen los
 * rechazos de negocio.
 */
export class MarcarIncidenteLocalizado
  implements IEjecutorComando<ComandoMarcarIncidenteLocalizado, ResultadoMarcarLocalizado>
{
  constructor(private readonly registro: IRegistroLocalizacionIncidente) {}

  async ejecutar(comando: ComandoMarcarIncidenteLocalizado): Promise<ResultadoMarcarLocalizado> {
    try {
      return await this.registro.marcarLocalizado({
        operacionId: comando.operacionId,
        incidenteId: comando.incidenteId,
        rescatistaId: comando.rescatistaId,
      });
    } catch (err) {
      if (err instanceof ErrorCierreIncidente) throw traducirErrorCierre(err);
      throw err;
    }
  }
}
