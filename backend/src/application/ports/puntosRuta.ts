import type { PuntoRuta } from '../../domain/entities/PuntoRuta.js';
import type { RutaConPuntos } from '../../domain/entities/RutaConPuntos.js';

export type DetallesPuntos = Record<string, string[]>;

export type OrdenGuardarPuntos = {
  senderistaId: string;
  expedicionId: string;
  versionEsperada: number;
  puntos: PuntoRuta[];
};

export type RechazoGuardadoPuntos =
  | { tipo: 'no_encontrado' }
  | { tipo: 'expedicion_no_editable' }
  | { tipo: 'expedicion_ya_iniciada' }
  | { tipo: 'version_obsoleta' }
  | { tipo: 'datos_invalidos'; detalles: DetallesPuntos };

export type ResultadoGuardadoPuntos =
  | { tipo: 'guardado'; ruta: RutaConPuntos }
  | RechazoGuardadoPuntos;

export interface IConsultaPuntosRuta {
  /** Fotografia consistente y privada, o null para plan ajeno/inexistente. */
  consultarPropia(senderistaId: string, expedicionId: string): Promise<RutaConPuntos | null>;
}

export interface IGuardadoPuntosRuta {
  /** Verifica propietario, estado, hora y version junto con la escritura atomica.
   * Un rechazo conserva puntos, version y metadatos anteriores.
   * Un guardado canonico identico conserva la version y los IDs.
   */
  guardarColeccionPropia(orden: OrdenGuardarPuntos): Promise<ResultadoGuardadoPuntos>;
}
