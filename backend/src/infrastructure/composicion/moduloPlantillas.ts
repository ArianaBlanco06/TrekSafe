import type { ModuloPlantillas } from '../../application/modulos/ModuloPlantillas.js';
import { CreadorDesdePlantilla } from '../../application/creacion-plan/CreadorDesdePlantilla.js';
import { ServicioPlantillas } from '../../application/services/servicioPlantillas.js';
import { DAOContactosVigentesSupabase } from '../repositories/DAOContactosVigentesSupabase.js';
import { DAOPlantillasSupabase } from '../repositories/DAOPlantillasSupabase.js';

/** Único lugar donde se instancian las clases concretas de HU-29. */
export function ensamblarModuloPlantillas(): ModuloPlantillas {
  const plantillas = new DAOPlantillasSupabase();
  const contactosVigentes = new DAOContactosVigentesSupabase();

  return {
    servicio: new ServicioPlantillas(plantillas, contactosVigentes),
    creadorDesdePlantilla: new CreadorDesdePlantilla(contactosVigentes, plantillas),
  };
}
