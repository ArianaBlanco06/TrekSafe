import type { IContactosVigentes } from '../../domain/repositories/IContactosVigentes.js';
import type { IPlanEditable, OrigenPlan } from './IPlanEditable.js';

export type BorradorPlan = {
  origen: OrigenPlan;
  origenId: string;
  descripcionOrigen: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  cantidadContactosNoVigentes: number;
  nombresAcompanantes: string[];
  horaInicio: null;
  horaRetornoEstimada: null;
  requiereFechasNuevas: true;
};

export abstract class CreadorPlan {
  constructor(protected readonly contactosVigentes: IContactosVigentes) {}

  /**
   * Operación común (no se redefine): invoca el Factory Method y aplica las
   * invariantes de toda variante: fechas vacías, solo contactos vigentes, sin
   * datos de la expedición original y sin compartir referencias con el producto.
   */
  async prepararBorrador(senderistaId: string, origenId: string): Promise<BorradorPlan> {
    const plan = await this.crearBorrador(senderistaId, origenId);

    const sugeridos = [...new Set(plan.idsContactosSugeridos)];
    const vigentes = new Set(await this.contactosVigentes.filtrarVigentes(senderistaId, sugeridos));
    const idsContactos = sugeridos.filter((id) => vigentes.has(id));

    return {
      origen: plan.origen,
      origenId: plan.origenId,
      descripcionOrigen: plan.describirOrigen(),
      lugarInicio: plan.lugarInicio,
      lugarFin: plan.lugarFin,
      coordenadasInicio: plan.coordenadasInicio,
      coordenadasFin: plan.coordenadasFin,
      minutosTolerancia: plan.minutosTolerancia,
      idsContactos,
      cantidadContactosNoVigentes: sugeridos.length - idsContactos.length,
      nombresAcompanantes: [...plan.nombresAcompanantes],
      horaInicio: null,
      horaRetornoEstimada: null,
      requiereFechasNuevas: true,
    };
  }

  /** Factory Method: cada creador concreto decide qué producto IPlanEditable construir. */
  protected abstract crearBorrador(senderistaId: string, origenId: string): Promise<IPlanEditable>;
}
