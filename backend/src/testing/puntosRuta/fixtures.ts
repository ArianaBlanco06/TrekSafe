import { randomUUID } from 'node:crypto';
import type { PuntoRuta } from '../../domain/entities/PuntoRuta.js';
import type { RutaConPuntos } from '../../domain/entities/RutaConPuntos.js';

export const senderistaFixture = '11111111-1111-4111-8111-111111111111';
export const otroSenderistaFixture = '33333333-3333-4333-8333-333333333333';
export const ahoraFixture = () => Date.parse('2030-01-01T00:00:00.000Z');

export function rutaFixture(id = randomUUID()): RutaConPuntos {
  return {
    expedicion: {
      id, estado: 'programada', lugarInicio: 'Inicio ficticio', lugarFin: 'Destino ficticio',
      coordenadasInicio: '-9.04000, -77.61000', coordenadasFin: '-9.01000, -77.60000',
      horaInicio: '2099-01-01T12:00:00.000Z', version: 1, editable: true,
    },
    puntos: [],
  };
}

export function puntoFixture(orden = 1, cambios: Partial<PuntoRuta> = {}): PuntoRuta {
  return { id: randomUUID(), nombre: `Punto ${orden}`, latitud: -9.03, longitud: -77.6, orden, ...cambios };
}
