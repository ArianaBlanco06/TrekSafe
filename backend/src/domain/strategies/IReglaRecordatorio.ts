import { type IReloj, RelojSistema } from '../services/IReloj.js';

export type UmbralRecordatorioMinutos = 15 | 30 | 60;

export const UMBRAL_RECORDATORIO_POR_DEFECTO: UmbralRecordatorioMinutos = 30;

/**
 * Interfaz requerida por el Product Backlog (DoD HU-38)
 * Define el contrato Strategy para calcular cuándo corresponde emitir el aviso de retorno.
 */
export interface IReglaRecordatorio {
  readonly minutosAnticipacion: UmbralRecordatorioMinutos;
  correspondeAvisar(horaRetornoEstimada: string | Date, reloj?: IReloj): boolean;
}

abstract class ReglaRecordatorioBase implements IReglaRecordatorio {
  abstract readonly minutosAnticipacion: UmbralRecordatorioMinutos;

  correspondeAvisar(horaRetornoEstimada: string | Date, reloj: IReloj = new RelojSistema()): boolean {
    const fechaRetorno = new Date(horaRetornoEstimada).getTime();
    if (isNaN(fechaRetorno)) return false;

    const fechaActual = reloj.ahora().getTime();
    const ventanaAlertaMs = this.minutosAnticipacion * 60_000;
    const momentoInicioAviso = fechaRetorno - ventanaAlertaMs;

    // Corresponde avisar si el reloj alcanzó la ventana de anticipación y aún no excede el retorno estimado
    return fechaActual >= momentoInicioAviso && fechaActual <= fechaRetorno;
  }
}

export class ReglaRecordatorio15Min extends ReglaRecordatorioBase {
  readonly minutosAnticipacion: UmbralRecordatorioMinutos = 15;
}

export class ReglaRecordatorio30Min extends ReglaRecordatorioBase {
  readonly minutosAnticipacion: UmbralRecordatorioMinutos = 30;
}

export class ReglaRecordatorio60Min extends ReglaRecordatorioBase {
  readonly minutosAnticipacion: UmbralRecordatorioMinutos = 60;
}

/**
 * Fábrica para seleccionar la estrategia correspondiente
 * CA-01: Conserva 30 como valor inicial y predeterminado.
 */
export class FabricaReglaRecordatorio {
  static obtener(minutos?: number | null): IReglaRecordatorio {
    switch (minutos) {
      case 15:
        return new ReglaRecordatorio15Min();
      case 60:
        return new ReglaRecordatorio60Min();
      case 30:
      default:
        return new ReglaRecordatorio30Min();
    }
  }

  static esUmbralValido(minutos: number): minutos is UmbralRecordatorioMinutos {
    return minutos === 15 || minutos === 30 || minutos === 60;
  }
}
