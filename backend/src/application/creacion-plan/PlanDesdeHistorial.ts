import type { ExpedicionParaRepetir } from '../../domain/repositories/IHistorialExpedicionesDAO.js';
import type { IPlanEditable } from './IPlanEditable.js';

/** Producto del Factory Method: conserva únicamente los datos reutilizables. */
export class PlanDesdeHistorial implements IPlanEditable {
  readonly origen = 'historial';
  readonly origenId: string;
  readonly lugarInicio: string;
  readonly lugarFin: string;
  readonly coordenadasInicio: string | null;
  readonly coordenadasFin: string | null;
  readonly minutosTolerancia: number;
  readonly idsContactosSugeridos: readonly string[];
  readonly nombresAcompanantes: readonly string[];

  constructor(expedicion: ExpedicionParaRepetir) {
    this.origenId = expedicion.id;
    this.lugarInicio = expedicion.lugarInicio;
    this.lugarFin = expedicion.lugarFin;
    this.coordenadasInicio = expedicion.coordenadasInicio;
    this.coordenadasFin = expedicion.coordenadasFin;
    this.minutosTolerancia = expedicion.minutosTolerancia;
    this.idsContactosSugeridos = Object.freeze([...expedicion.idsContactos]);
    this.nombresAcompanantes = Object.freeze([...expedicion.nombresAcompanantes]);
    Object.freeze(this);
  }

  describirOrigen(): string {
    return `Expedición completada «${this.lugarFin}»`;
  }
}
