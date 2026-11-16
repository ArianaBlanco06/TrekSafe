export type PlantillaRuta = {
  id: string;
  senderistaId: string;
  nombre: string;
  lugarInicio: string;
  lugarFin: string;
  coordenadasInicio: string | null;
  coordenadasFin: string | null;
  minutosTolerancia: number;
  idsContactos: string[];
  nombresAcompanantes: string[];
  version: number;
  creadoEn: string;
  actualizadoEn: string;
};
