import type { PreparacionExpedicion } from '../entities/PreparacionExpedicion.js';


export interface IPreparacionExpedicionDAO {
  obtener(senderistaId: string, expedicionId: string): Promise<PreparacionExpedicion | null>;
  asociarLista(senderistaId: string, expedicionId: string, listaId: string): Promise<PreparacionExpedicion>;
  establecerPreparado(
    senderistaId: string,
    expedicionId: string,
    itemId: string,
    preparado: boolean,
  ): Promise<PreparacionExpedicion>;
}
