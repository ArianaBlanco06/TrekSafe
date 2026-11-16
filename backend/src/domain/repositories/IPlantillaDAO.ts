import type { PlantillaRuta } from '../entities/PlantillaRuta.js';

export type DatosPlantilla = {
  nombre: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
};

export type ResultadoCrearPlantilla =
  | { tipo: 'ok'; plantilla: PlantillaRuta }
  | { tipo: 'nombre_duplicado' };

export type ResultadoRenombrarPlantilla =
  | { tipo: 'ok'; plantilla: PlantillaRuta }
  | { tipo: 'no_encontrada' }
  | { tipo: 'version_obsoleta'; versionActual: number }
  | { tipo: 'nombre_duplicado' };

/**
 * Persistencia privada por propietario: toda operación recibe `senderistaId`
 * y una plantilla ajena se comporta como inexistente.
 */
export interface IPlantillaDAO {
  /** Orden estable: actualizadoEn descendente, luego id ascendente. */
  listarPorPropietario(senderistaId: string): Promise<PlantillaRuta[]>;
  buscarPorId(senderistaId: string, plantillaId: string): Promise<PlantillaRuta | null>;
  crear(senderistaId: string, datos: DatosPlantilla): Promise<ResultadoCrearPlantilla>;
  renombrar(
    senderistaId: string,
    plantillaId: string,
    nombre: string,
    versionEsperada: number,
  ): Promise<ResultadoRenombrarPlantilla>;
  eliminar(senderistaId: string, plantillaId: string): Promise<boolean>;
}
