import type { EstadoExpedicion } from '../value-objects/enums.js';
import type { PuntoRuta } from './PuntoRuta.js';

// Limite de expediciones.version INTEGER, compartido con HU-26.
export const MAX_VERSION_PLAN = 2_147_483_647;

export type RutaConPuntos = {
  expedicion: {
    id: string;
    // HU-27 incorporara cancelada al ciclo compartido; HU-32 ya admite su lectura.
    estado: EstadoExpedicion | 'cancelada';
    lugarInicio: string;
    lugarFin: string;
    coordenadasInicio: string | null;
    coordenadasFin: string | null;
    horaInicio: string;
    version: number;
    editable: boolean;
  };
  puntos: PuntoRuta[];
};
