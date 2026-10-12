export type RegistroInstitucionalRescatista = {
  id: string;
  institucion: 'AGMP' | 'MINCETUR';
  numeroCredencial: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  estaActivo: boolean;
  creadoEn?: string;
};
