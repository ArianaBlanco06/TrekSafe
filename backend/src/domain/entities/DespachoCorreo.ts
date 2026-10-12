import type { TipoDespachoCorreo } from '../value-objects/enums.js';

export type DespachoCorreo = {
  id: string;
  expedicionId: string;
  tipoDespacho: TipoDespachoCorreo;
  claveDestinatario: string;
  enviadoEn: string;
};
