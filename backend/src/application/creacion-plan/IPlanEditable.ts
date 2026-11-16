export type OrigenPlan = 'plantilla' | 'historial';

/** Producto abstracto del Factory Method: un plan listo para editar antes de crear la expedición. */
export interface IPlanEditable {
  readonly origen: OrigenPlan;
  readonly origenId: string;
  readonly lugarInicio: string;
  readonly lugarFin: string;
  readonly coordenadasInicio: string | null;
  readonly coordenadasFin: string | null;
  readonly minutosTolerancia: number;
  readonly idsContactosSugeridos: readonly string[];
  readonly nombresAcompanantes: readonly string[];
  describirOrigen(): string;
}
