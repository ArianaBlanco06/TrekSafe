import type { CreadorPlan } from '../creacion-plan/CreadorPlan.js';
import type { ServicioPlantillas } from '../services/servicioPlantillas.js';

/** Dependencias ya ensambladas que consume la capa de presentación. */
export type ModuloPlantillas = {
  servicio: ServicioPlantillas;
  creadorDesdePlantilla: CreadorPlan;
};
