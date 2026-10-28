import type { PlantillaRuta } from '../../domain/entities/PlantillaRuta.js';
import type { IPlanEditable, OrigenPlan } from './IPlanEditable.js';

export class PlanDesdePlantilla implements IPlanEditable {
  readonly origen: OrigenPlan = 'plantilla';
  readonly origenId: string;
  readonly lugarInicio: string;
  readonly lugarFin: string;
  readonly coordenadasInicio: string | null;
  readonly coordenadasFin: string | null;
  readonly minutosTolerancia: number;
  readonly idsContactosSugeridos: readonly string[];
  readonly nombresAcompanantes: readonly string[];

  constructor(private readonly plantilla: PlantillaRuta) {
    this.origenId = plantilla.id;
    this.lugarInicio = plantilla.lugarInicio;
    this.lugarFin = plantilla.lugarFin;
    this.coordenadasInicio = plantilla.coordenadasInicio;
    this.coordenadasFin = plantilla.coordenadasFin;
    this.minutosTolerancia = plantilla.minutosTolerancia;
    this.idsContactosSugeridos = [...plantilla.idsContactos];
    this.nombresAcompanantes = [...plantilla.nombresAcompanantes];
  }

  describirOrigen(): string {
    return `Plantilla «${this.plantilla.nombre}»`;
  }
}
