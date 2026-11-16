import { api } from './clienteApi';
import type { BorradorDesdePlantilla, PlantillaCuenta } from '@/lib/plantillasCuentaLogica';

export type { BorradorDesdePlantilla, PlantillaCuenta };

export type DatosGuardarPlantilla = {
  nombre: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio?: string;
  coordenadasFin?: string;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
};

export function listarPlantillasCuenta() {
  return api.get<{ plantillas: PlantillaCuenta[] }>('/plantillas', true);
}

export function guardarPlantillaCuenta(datos: DatosGuardarPlantilla) {
  return api.post<{ mensaje: string; plantilla: PlantillaCuenta }>('/plantillas', datos, true);
}

export function renombrarPlantillaCuenta(id: string, nombre: string, versionEsperada: number) {
  return api.patch<{ mensaje: string; plantilla: PlantillaCuenta }>(
    `/plantillas/${id}`,
    { nombre, versionEsperada },
    true,
  );
}

export function eliminarPlantillaCuenta(id: string) {
  return api.delete<void>(`/plantillas/${id}`, true);
}

export function obtenerBorradorDesdePlantilla(id: string) {
  return api.get<{ borrador: BorradorDesdePlantilla }>(`/plantillas/${id}/borrador`, true);
}
