export type DatosBorrador = {
  lugarInicio: string; lugarFin: string; coordenadasInicio: string; coordenadasFin: string;
  horaInicio: string; horaRetornoEstimada: string; minutosTolerancia: number;
  minutosRecordatorio?: number; idsContactos: string[]; nombresAcompanantes: string[];
};
export type BorradorExpedicion = DatosBorrador & {
  id: string; guardadoEn: string; estado: 'pendiente' | 'error' | 'sincronizado';
  error?: string; envioIncierto?: boolean; expedicionId?: string;
};
export interface IColaLocal {
  listar(): Promise<BorradorExpedicion[]>;
  insertar(datos: DatosBorrador): Promise<BorradorExpedicion>;
  actualizar(id: string, modificar: (actual: BorradorExpedicion) => BorradorExpedicion): Promise<BorradorExpedicion>;
  eliminar(id: string): Promise<void>;
}
