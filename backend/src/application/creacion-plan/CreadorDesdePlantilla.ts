import type { IContactosVigentes } from '../../domain/repositories/IContactosVigentes.js';
import type { IPlantillaDAO } from '../../domain/repositories/IPlantillaDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { CreadorPlan } from './CreadorPlan.js';
import type { IPlanEditable } from './IPlanEditable.js';
import { PlanDesdePlantilla } from './PlanDesdePlantilla.js';

export class CreadorDesdePlantilla extends CreadorPlan {
  constructor(
    contactosVigentes: IContactosVigentes,
    private readonly plantillas: IPlantillaDAO,
  ) {
    super(contactosVigentes);
  }

  protected async crearBorrador(senderistaId: string, origenId: string): Promise<IPlanEditable> {
    const plantilla = await this.plantillas.buscarPorId(senderistaId, origenId);
    if (!plantilla) {
      throw new ErrorAplicacion(404, 'Plantilla no encontrada', 'PLANTILLA_NO_ENCONTRADA');
    }
    return new PlanDesdePlantilla(plantilla);
  }
}
